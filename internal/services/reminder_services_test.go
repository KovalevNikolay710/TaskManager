package services

import (
	"TaskManager/internal/models"
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// fakeSubscriptionStore — подписки в памяти вместо БД.
type fakeSubscriptionStore struct {
	subs []*models.PushSubscription
}

func (store *fakeSubscriptionStore) FindByEndpoint(endpoint string) (*models.PushSubscription, error) {
	for _, sub := range store.subs {
		if sub.Endpoint == endpoint {
			return sub, nil
		}
	}
	return nil, nil
}

func (store *fakeSubscriptionStore) FindByUserID(userID int64) ([]*models.PushSubscription, error) {
	var result []*models.PushSubscription
	for _, sub := range store.subs {
		if sub.UserId == userID {
			result = append(result, sub)
		}
	}
	return result, nil
}

func (store *fakeSubscriptionStore) Upsert(sub *models.PushSubscription) (*models.PushSubscription, bool, error) {
	store.subs = append(store.subs, sub)
	return sub, true, nil
}

func (store *fakeSubscriptionStore) DeleteByEndpoint(userID int64, endpoint string) (bool, error) {
	for i, sub := range store.subs {
		if sub.UserId == userID && sub.Endpoint == endpoint {
			store.subs = append(store.subs[:i], store.subs[i+1:]...)
			return true, nil
		}
	}
	return false, nil
}

func (store *fakeSubscriptionStore) DeleteByID(subscriptionID int64) error {
	for i, sub := range store.subs {
		if sub.SubscriptionId == subscriptionID {
			store.subs = append(store.subs[:i], store.subs[i+1:]...)
			return nil
		}
	}
	return nil
}

// fakeJournal — журнал notification_log в памяти.
type fakeJournal struct {
	recorded  map[models.NotificationLog]bool
	forgotten int
}

func journalKey(entry *models.NotificationLog) models.NotificationLog {
	return models.NotificationLog{UserId: entry.UserId, Kind: entry.Kind, TaskId: entry.TaskId, Key: entry.Key}
}

func (journal *fakeJournal) TryRecord(entry *models.NotificationLog) (bool, error) {
	key := journalKey(entry)
	if journal.recorded[key] {
		return false, nil
	}
	journal.recorded[key] = true
	return true, nil
}

func (journal *fakeJournal) Forget(entry *models.NotificationLog) error {
	delete(journal.recorded, journalKey(entry))
	journal.forgotten++
	return nil
}

// newTestReminderService собирает планировщик без БД: подписки и журнал в памяти,
// VAPID-ключи — как из окружения, отправка — через подменный PushSender.
func newTestReminderService(t *testing.T, sender PushSender, subs ...*models.PushSubscription) (*ReminderServiceImpl, *fakeJournal, *fakeSubscriptionStore) {
	t.Helper()
	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	store := &fakeSubscriptionStore{subs: subs}
	pushService := NewPushService(store, nil, sender, PushConfig{PublicKey: publicKey, PrivateKey: privateKey}, logger)
	journal := &fakeJournal{recorded: map[models.NotificationLog]bool{}}
	return &ReminderServiceImpl{PushService: pushService, LogRepo: journal, Logger: logger}, journal, store
}

func TestSendOnceForgetsFailedDelivery(t *testing.T) {
	const endpoint = "https://fcm.googleapis.com/fcm/send/phone"
	phone := func() *models.PushSubscription {
		return &models.PushSubscription{SubscriptionId: 1, UserId: 1, Endpoint: endpoint}
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name        string
		ctx         context.Context
		status      int
		err         error
		subs        []*models.PushSubscription
		wantSent    bool
		wantKept    bool // запись в журнале осталась: повтора не будет
		wantSubLeft bool
	}{
		{name: "доставлено — запись остаётся", ctx: context.Background(), status: 201, subs: []*models.PushSubscription{phone()}, wantSent: true, wantKept: true, wantSubLeft: true},
		{name: "ошибка сети — запись удалена, повторим", ctx: context.Background(), err: errors.New("connection reset"), subs: []*models.PushSubscription{phone()}, wantKept: false, wantSubLeft: true},
		{name: "push-сервис ответил 503 — запись удалена", ctx: context.Background(), status: 503, subs: []*models.PushSubscription{phone()}, wantKept: false, wantSubLeft: true},
		{name: "подписок нет — повторять некуда", ctx: context.Background(), subs: nil, wantKept: true},
		{name: "подписка устарела (410) — удалена, запись остаётся", ctx: context.Background(), status: 410, subs: []*models.PushSubscription{phone()}, wantKept: true},
		{name: "остановка сервера — запись остаётся", ctx: canceled, err: context.Canceled, subs: []*models.PushSubscription{phone()}, wantKept: true, wantSubLeft: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sender := &fakeSender{statuses: map[string]int{endpoint: tt.status}, errs: map[string]error{endpoint: tt.err}}
			serv, journal, store := newTestReminderService(t, sender, tt.subs...)
			opts := PushOptions{TTL: time.Hour, Urgency: urgencyNormal, Topic: "plan-morning"}
			msg := PushMessage{Title: "Составьте план на сегодня", Tag: "plan-morning"}

			sent, err := serv.sendOnce(tt.ctx, 1, models.NotificationKindMorning, 0, "2026-10-05", msg, opts, time.Now())
			if err != nil {
				t.Fatalf("ошибка %v", err)
			}
			if sent != tt.wantSent {
				t.Errorf("отправлено = %v, ожидалось %v", sent, tt.wantSent)
			}
			key := models.NotificationLog{UserId: 1, Kind: models.NotificationKindMorning, Key: "2026-10-05"}
			if journal.recorded[key] != tt.wantKept {
				t.Errorf("запись в журнале = %v, ожидалось %v", journal.recorded[key], tt.wantKept)
			}
			if left := len(store.subs) == 1; left != tt.wantSubLeft {
				t.Errorf("подписка осталась = %v, ожидалось %v", left, tt.wantSubLeft)
			}

			// Повторная проверка: после сбоя напоминание отправляется снова, иначе — нет
			sender.sent = nil
			if _, err := serv.sendOnce(context.Background(), 1, models.NotificationKindMorning, 0, "2026-10-05", msg, opts, time.Now()); err != nil {
				t.Fatalf("ошибка при повторе %v", err)
			}
			if retried := len(sender.sent) > 0; retried != !tt.wantKept {
				t.Errorf("повторная отправка = %v, ожидалось %v", retried, !tt.wantKept)
			}
		})
	}
}

func TestDeliverForgetsAllSummaryEntries(t *testing.T) {
	const endpoint = "https://fcm.googleapis.com/fcm/send/phone"
	sender := &fakeSender{errs: map[string]error{endpoint: errors.New("timeout")}}
	serv, journal, _ := newTestReminderService(t, sender, &models.PushSubscription{SubscriptionId: 1, UserId: 1, Endpoint: endpoint})

	var entries []*models.NotificationLog
	for taskID := int64(1); taskID <= 3; taskID++ {
		entry := &models.NotificationLog{UserId: 1, Kind: models.NotificationKindDeadline, TaskId: taskID, Key: "2026-10-05T15:00:00Z"}
		if _, err := journal.TryRecord(entry); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, entry)
	}
	opts := PushOptions{TTL: time.Hour, Urgency: urgencyHigh, Topic: "deadline-summary"}
	if serv.deliver(context.Background(), 1, PushMessage{Tag: "deadline-summary"}, opts, entries...) {
		t.Error("сводка не должна считаться доставленной")
	}
	if len(journal.recorded) != 0 || journal.forgotten != 3 {
		t.Errorf("в журнале осталось %d записей, удалено %d; ожидалось 0 и 3", len(journal.recorded), journal.forgotten)
	}
}
