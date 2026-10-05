package services

import (
	"TaskManager/internal/models"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	_ "time/tzdata" // time.LoadLocation в тестах не зависит от системной tzdata

	webpush "github.com/SherClockHolmes/webpush-go"
)

func ptr[T any](value T) *T { return &value }

func TestApplySettingsUpdate(t *testing.T) {
	tests := []struct {
		name    string
		before  func(s *models.NotificationSettings)
		input   models.NotificationSettingsUpdateRequest
		wantErr error
		check   func(t *testing.T, s models.NotificationSettings)
	}{
		{
			name:  "пустое тело ничего не меняет",
			input: models.NotificationSettingsUpdateRequest{},
			check: func(t *testing.T, s models.NotificationSettings) {
				if s != models.DefaultNotificationSettings(1) {
					t.Errorf("настройки изменились: %+v", s)
				}
			},
		},
		{
			name:  "выключение сохраняет время",
			input: models.NotificationSettingsUpdateRequest{MorningEnabled: ptr(false)},
			check: func(t *testing.T, s models.NotificationSettings) {
				if s.MorningEnabled || s.MorningTime != "08:00" {
					t.Errorf("MorningEnabled=%v MorningTime=%q", s.MorningEnabled, s.MorningTime)
				}
			},
		},
		{
			name: "все поля",
			input: models.NotificationSettingsUpdateRequest{
				MorningTime: ptr("07:30"), EveningEnabled: ptr(false), EveningTime: ptr("22:00"),
				DeadlineHoursBefore: ptr(6), QuietFrom: ptr("22:30"), QuietTo: ptr("08:00"), Timezone: ptr("Europe/Moscow"),
			},
			check: func(t *testing.T, s models.NotificationSettings) {
				if s.MorningTime != "07:30" || s.EveningEnabled || s.EveningTime != "22:00" || s.DeadlineHoursBefore != 6 ||
					s.QuietFrom != "22:30" || s.QuietTo != "08:00" || s.Timezone != "Europe/Moscow" {
					t.Errorf("настройки %+v", s)
				}
			},
		},
		{
			name:  "интервал в пределах дня допустим",
			input: models.NotificationSettingsUpdateRequest{QuietFrom: ptr("13:00"), QuietTo: ptr("15:00")},
		},
		{name: "время не ЧЧ:ММ", input: models.NotificationSettingsUpdateRequest{MorningTime: ptr("7:30")}, wantErr: ErrInvalidClockTime},
		{name: "время вне суток", input: models.NotificationSettingsUpdateRequest{EveningTime: ptr("24:00")}, wantErr: ErrInvalidClockTime},
		{name: "пустое время", input: models.NotificationSettingsUpdateRequest{QuietTo: ptr("")}, wantErr: ErrInvalidClockTime},
		{name: "за 0 ч", input: models.NotificationSettingsUpdateRequest{DeadlineHoursBefore: ptr(0)}, wantErr: ErrInvalidDeadlineHours},
		{name: "за 25 ч", input: models.NotificationSettingsUpdateRequest{DeadlineHoursBefore: ptr(25)}, wantErr: ErrInvalidDeadlineHours},
		{name: "за 24 ч — можно", input: models.NotificationSettingsUpdateRequest{DeadlineHoursBefore: ptr(24)}},
		{
			name:    "начало = конец по итоговым значениям: прислан только quietTo",
			input:   models.NotificationSettingsUpdateRequest{QuietTo: ptr("23:00")},
			wantErr: ErrQuietHoursEqual,
		},
		{
			name:    "начало = конец: прислали оба",
			input:   models.NotificationSettingsUpdateRequest{QuietFrom: ptr("10:00"), QuietTo: ptr("10:00")},
			wantErr: ErrQuietHoursEqual,
		},
		{
			name:   "сохранённые значения уже совпадают, обновление их не трогает — всё равно ошибка",
			before: func(s *models.NotificationSettings) { s.QuietTo = s.QuietFrom },
			input:  models.NotificationSettingsUpdateRequest{MorningEnabled: ptr(false)}, wantErr: ErrQuietHoursEqual,
		},
		{name: "неизвестный часовой пояс", input: models.NotificationSettingsUpdateRequest{Timezone: ptr("Mars/Olympus")}, wantErr: ErrUnknownTimezone},
		{
			name:  "пустой часовой пояс — пояс сервера",
			input: models.NotificationSettingsUpdateRequest{Timezone: ptr("")},
			check: func(t *testing.T, s models.NotificationSettings) {
				if s.Timezone != "" {
					t.Errorf("Timezone = %q", s.Timezone)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := models.DefaultNotificationSettings(1)
			if tt.before != nil {
				tt.before(&s)
			}
			err := applySettingsUpdate(&s, tt.input)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("ошибка %v, ожидалась %v", err, tt.wantErr)
			}
			if err == nil && tt.check != nil {
				tt.check(t, s)
			}
		})
	}
}

func TestClassifyPushStatus(t *testing.T) {
	tests := map[int]pushOutcome{
		http.StatusCreated:               pushDelivered,
		http.StatusOK:                    pushDelivered,
		http.StatusNotFound:              pushGone,
		http.StatusGone:                  pushGone,
		http.StatusForbidden:             pushGone, // подписка сделана с другими VAPID-ключами
		http.StatusBadRequest:            pushFailed,
		http.StatusRequestEntityTooLarge: pushFailed,
		http.StatusTooManyRequests:       pushFailed,
		http.StatusInternalServerError:   pushFailed,
	}
	for status, want := range tests {
		if got := classifyPushStatus(status); got != want {
			t.Errorf("статус %d: %v, ожидалось %v", status, got, want)
		}
	}
}

// fakeSender отвечает статусом по адресу подписки и запоминает, что отправлено.
type fakeSender struct {
	statuses map[string]int
	errs     map[string]error
	sent     []string
	opts     []PushOptions
}

func (sender *fakeSender) Send(_ context.Context, _ VapidCredentials, sub *models.PushSubscription, _ []byte, opts PushOptions) (int, error) {
	sender.sent = append(sender.sent, sub.Endpoint)
	sender.opts = append(sender.opts, opts)
	if err := sender.errs[sub.Endpoint]; err != nil {
		return 0, err
	}
	return sender.statuses[sub.Endpoint], nil
}

func TestDeliver(t *testing.T) {
	sub := func(id int64, endpoint string) *models.PushSubscription {
		return &models.PushSubscription{SubscriptionId: id, UserId: 1, Endpoint: endpoint}
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	networkErr := errors.New("сеть недоступна")

	tests := []struct {
		name     string
		statuses map[string]int
		errs     map[string]error
		subs     []*models.PushSubscription
		wantSent int
		wantGone []int64
		wantErr  bool
	}{
		{
			name:     "все доставлены",
			statuses: map[string]int{"https://a": 201, "https://b": 201},
			subs:     []*models.PushSubscription{sub(1, "https://a"), sub(2, "https://b")},
			wantSent: 2,
		},
		{
			name:     "404, 410 и 403 — мёртвые подписки",
			statuses: map[string]int{"https://a": 404, "https://b": 410, "https://c": 403, "https://d": 201},
			subs:     []*models.PushSubscription{sub(1, "https://a"), sub(2, "https://b"), sub(3, "https://c"), sub(4, "https://d")},
			wantSent: 1,
			wantGone: []int64{1, 2, 3},
		},
		{
			name:     "сбой push-сервиса — подписка остаётся, ошибка в результате",
			statuses: map[string]int{"https://a": 503},
			subs:     []*models.PushSubscription{sub(1, "https://a")},
			wantErr:  true,
		},
		{
			name:     "ошибка сети не мешает остальным",
			statuses: map[string]int{"https://b": 201},
			errs:     map[string]error{"https://a": networkErr},
			subs:     []*models.PushSubscription{sub(1, "https://a"), sub(2, "https://b")},
			wantSent: 1,
			wantErr:  true,
		},
		{name: "подписок нет", subs: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sender := &fakeSender{statuses: tt.statuses, errs: tt.errs}
			opts := PushOptions{TTL: testTTL, Urgency: urgencyNormal, Topic: "test"}
			result := deliver(context.Background(), sender, VapidCredentials{}, tt.subs, []byte(`{}`), opts, logger)

			if result.Sent != tt.wantSent {
				t.Errorf("доставлено %d, ожидалось %d", result.Sent, tt.wantSent)
			}
			gone := make([]int64, 0, len(result.Gone))
			for _, s := range result.Gone {
				gone = append(gone, s.SubscriptionId)
			}
			if len(gone) != len(tt.wantGone) {
				t.Errorf("мёртвые %v, ожидались %v", gone, tt.wantGone)
			} else {
				for i := range gone {
					if gone[i] != tt.wantGone[i] {
						t.Errorf("мёртвые %v, ожидались %v", gone, tt.wantGone)
						break
					}
				}
			}
			if (result.Err != nil) != tt.wantErr {
				t.Errorf("ошибка %v, ожидалась: %v", result.Err, tt.wantErr)
			}
			if len(sender.sent) != len(tt.subs) {
				t.Errorf("отправок %d, подписок %d", len(sender.sent), len(tt.subs))
			}
			for _, got := range sender.opts {
				if got != opts {
					t.Errorf("заголовки %+v, ожидались %+v", got, opts)
				}
			}
		})
	}
}

func TestValidateEndpoint(t *testing.T) {
	tests := map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":              true,
		"https://updates.push.services.mozilla.com/wpush/v2/x": true,
		"http://fcm.googleapis.com/fcm/send/abc":               false,
		"https:///nohost":                                      false,
		"fcm.googleapis.com/fcm/send/abc":                      false,
		"":                                                     false,
	}
	for endpoint, ok := range tests {
		if err := validateEndpoint(endpoint); (err == nil) != ok {
			t.Errorf("%q: ошибка %v, ожидалось допустимо = %v", endpoint, err, ok)
		}
	}
}

func TestValidateKeys(t *testing.T) {
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	auth := base64.RawURLEncoding.EncodeToString(make([]byte, pushAuthSecretLen))

	if err := validateVapidKeys(public, private); err != nil {
		t.Errorf("сгенерированные VAPID-ключи не прошли проверку: %v", err)
	}
	if err := validateVapidKeys(private, public); err == nil {
		t.Error("ключи, перепутанные местами, прошли проверку")
	}
	if err := validateVapidKeys(public+"==", private); err != nil {
		t.Errorf("base64url с выравниванием не принят: %v", err)
	}

	// p256dh подписки — тоже несжатая точка P-256
	if err := validateSubscriptionKeys(public, auth); err != nil {
		t.Errorf("верные ключи подписки не прошли проверку: %v", err)
	}
	for name, keys := range map[string][2]string{
		"auth не 16 байт":     {public, base64.RawURLEncoding.EncodeToString(make([]byte, 8))},
		"p256dh не base64url": {"не ключ", auth},
		"p256dh не точка":     {base64.RawURLEncoding.EncodeToString(make([]byte, 65)), auth},
	} {
		if err := validateSubscriptionKeys(keys[0], keys[1]); !errors.Is(err, ErrInvalidSubscriptionKeys) {
			t.Errorf("%s: ошибка %v, ожидалась ErrInvalidSubscriptionKeys", name, err)
		}
	}
}
