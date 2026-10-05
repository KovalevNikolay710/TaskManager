package services

import (
	"TaskManager/internal/models"
	rep "TaskManager/internal/repository"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// DefaultVapidSubject — subject VAPID, если VAPID_SUBJECT не задан.
const DefaultVapidSubject = "mailto:admin@localhost"

// PushConfig — настройки push из окружения (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
// Пустые ключи — взять из БД или создать.
type PushConfig struct {
	PublicKey  string
	PrivateKey string
	Subject    string
}

// Длины ключей P-256 после base64url: публичный — несжатая точка (65 байт), приватный — 32 байта,
// секрет подписки auth — 16 байт.
const (
	p256PublicKeyLen  = 65
	p256PrivateKeyLen = 32
	pushAuthSecretLen = 16
)

type PushServiceImpl struct {
	SubscriptionRepo *rep.PushSubscriptionRepositoryImpl
	VapidRepo        *rep.VapidKeysRepositoryImpl
	Sender           PushSender
	Logger           *slog.Logger

	config PushConfig
	mu     sync.Mutex
	vapid  *VapidCredentials // загруженные ключи; nil — ещё не загружены (например, БД была недоступна)
}

func NewPushService(subRepo *rep.PushSubscriptionRepositoryImpl, vapidRepo *rep.VapidKeysRepositoryImpl, sender PushSender, config PushConfig, logger *slog.Logger) *PushServiceImpl {
	if strings.TrimSpace(config.Subject) == "" {
		config.Subject = DefaultVapidSubject
	}
	return &PushServiceImpl{
		SubscriptionRepo: subRepo,
		VapidRepo:        vapidRepo,
		Sender:           sender,
		Logger:           logger,
		config:           config,
	}
}

// InitKeys загружает VAPID-ключи при старте: окружение → БД → создание новой пары.
// Если не получилось (например, БД недоступна), ключи загрузятся при первом запросе.
func (serv *PushServiceImpl) InitKeys() error {
	_, err := serv.credentials()
	return err
}

// PublicKey — публичный VAPID-ключ (base64url) для pushManager.subscribe.
func (serv *PushServiceImpl) PublicKey() (string, error) {
	vapid, err := serv.credentials()
	if err != nil {
		return "", err
	}
	return vapid.PublicKey, nil
}

func (serv *PushServiceImpl) credentials() (VapidCredentials, error) {
	serv.mu.Lock()
	defer serv.mu.Unlock()
	if serv.vapid != nil {
		return *serv.vapid, nil
	}
	vapid, err := serv.loadKeys()
	if err != nil {
		return VapidCredentials{}, err
	}
	serv.vapid = vapid
	return *vapid, nil
}

func (serv *PushServiceImpl) loadKeys() (*VapidCredentials, error) {
	public := strings.TrimSpace(serv.config.PublicKey)
	private := strings.TrimSpace(serv.config.PrivateKey)

	// 1. Окружение: приоритет у него, в БД не пишем
	if public != "" && private != "" {
		if err := validateVapidKeys(public, private); err != nil {
			return nil, fmt.Errorf("VAPID-ключи из окружения: %w", err)
		}
		serv.Logger.Info("VAPID-ключи взяты из окружения", slog.String("publicKey", public))
		return &VapidCredentials{PublicKey: public, PrivateKey: private, Subject: serv.config.Subject}, nil
	}
	if public != "" || private != "" {
		serv.Logger.Warn("Задан только один из VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY, используются ключи из БД")
	}

	// 2–3. БД или новая пара, сохранённая в той же транзакции, что и проверка
	keys, created, err := serv.VapidRepo.GetOrCreate(func() (models.VapidKeys, error) {
		privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return models.VapidKeys{}, fmt.Errorf("ошибка при создании VAPID-ключей: %w", err)
		}
		return models.VapidKeys{PublicKey: publicKey, PrivateKey: privateKey}, nil
	})
	if err != nil {
		return nil, fmt.Errorf("не удалось получить VAPID-ключи: %w", err)
	}
	if err := validateVapidKeys(keys.PublicKey, keys.PrivateKey); err != nil {
		return nil, fmt.Errorf("VAPID-ключи из БД: %w", err)
	}
	if created {
		serv.Logger.Info("созданы VAPID-ключи", slog.String("publicKey", keys.PublicKey))
	}
	return &VapidCredentials{PublicKey: keys.PublicKey, PrivateKey: keys.PrivateKey, Subject: serv.config.Subject}, nil
}

// decodeBase64URL декодирует base64url с выравниванием «=» и без него.
func decodeBase64URL(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(value, "="))
}

// validateVapidKeys проверяет формат ключей, не раскрывая их в тексте ошибки.
func validateVapidKeys(public, private string) error {
	if decoded, err := decodeBase64URL(public); err != nil || len(decoded) != p256PublicKeyLen || decoded[0] != 0x04 {
		return errors.New("публичный ключ должен быть несжатой точкой P-256 в base64url")
	}
	if decoded, err := decodeBase64URL(private); err != nil || len(decoded) != p256PrivateKeyLen {
		return errors.New("приватный ключ должен быть 32 байтами в base64url")
	}
	return nil
}

// validateEndpoint — адрес push-сервиса: абсолютный https:// с хостом.
func validateEndpoint(endpoint string) error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return ErrInvalidEndpoint
	}
	return nil
}

// validateSubscriptionKeys — ключи шифрования подписки из subscription.toJSON().
func validateSubscriptionKeys(p256dh, auth string) error {
	if decoded, err := decodeBase64URL(p256dh); err != nil || len(decoded) != p256PublicKeyLen || decoded[0] != 0x04 {
		return ErrInvalidSubscriptionKeys
	}
	if decoded, err := decodeBase64URL(auth); err != nil || len(decoded) != pushAuthSecretLen {
		return ErrInvalidSubscriptionKeys
	}
	return nil
}

// endpointHost — только хост push-сервиса для логов: полный адрес подписки — секрет устройства.
func endpointHost(endpoint string) string {
	if parsed, err := url.Parse(endpoint); err == nil {
		return parsed.Host
	}
	return ""
}

// Subscribe сохраняет подписку устройства (upsert по Endpoint). created — подписка новая.
func (serv *PushServiceImpl) Subscribe(input models.PushSubscribeRequest) (*models.PushSubscriptionResponse, bool, error) {
	endpoint := strings.TrimSpace(input.Endpoint)
	if err := validateEndpoint(endpoint); err != nil {
		return nil, false, err
	}
	p256dh, auth := strings.TrimSpace(input.Keys.P256dh), strings.TrimSpace(input.Keys.Auth)
	if err := validateSubscriptionKeys(p256dh, auth); err != nil {
		return nil, false, err
	}

	saved, created, err := serv.SubscriptionRepo.Upsert(&models.PushSubscription{
		UserId:    input.UserId,
		Endpoint:  endpoint,
		P256dh:    p256dh,
		Auth:      auth,
		UserAgent: strings.TrimSpace(input.UserAgent),
	})
	if err != nil {
		return nil, false, fmt.Errorf("не удалось сохранить подписку: %w", err)
	}

	serv.Logger.Info("Подписка на push сохранена",
		slog.Int64("userId", saved.UserId),
		slog.Int64("subscriptionId", saved.SubscriptionId),
		slog.String("pushService", endpointHost(saved.Endpoint)),
		slog.Bool("created", created))
	response := models.NewPushSubscriptionResponse(saved)
	return &response, created, nil
}

// Unsubscribe удаляет подписку устройства пользователя или возвращает ErrSubscriptionNotFound.
func (serv *PushServiceImpl) Unsubscribe(input models.PushUnsubscribeRequest) error {
	deleted, err := serv.SubscriptionRepo.DeleteByEndpoint(input.UserId, strings.TrimSpace(input.Endpoint))
	if err != nil {
		return fmt.Errorf("не удалось удалить подписку: %w", err)
	}
	if !deleted {
		return ErrSubscriptionNotFound
	}
	serv.Logger.Info("Подписка на push удалена", slog.Int64("userId", input.UserId))
	return nil
}

// SendTest отправляет «4. Тестовое» на устройство с endpoint или, без него, на все устройства пользователя.
// ErrSubscriptionNotFound — подписки нет; ErrSubscriptionGone — push-сервис её больше не принимает (удалена).
func (serv *PushServiceImpl) SendTest(ctx context.Context, input models.PushTestRequest) (int, error) {
	var subs []*models.PushSubscription
	if endpoint := strings.TrimSpace(input.Endpoint); endpoint != "" {
		sub, err := serv.SubscriptionRepo.FindByEndpoint(endpoint)
		if err != nil {
			return 0, fmt.Errorf("ошибка при поиске подписки: %w", err)
		}
		if sub == nil || sub.UserId != input.UserId {
			return 0, ErrSubscriptionNotFound
		}
		subs = []*models.PushSubscription{sub}
	} else {
		var err error
		if subs, err = serv.SubscriptionRepo.FindByUserID(input.UserId); err != nil {
			return 0, fmt.Errorf("ошибка при поиске подписок: %w", err)
		}
		if len(subs) == 0 {
			return 0, ErrSubscriptionNotFound
		}
	}

	result, err := serv.send(ctx, subs, testMessage(), PushOptions{TTL: testTTL, Urgency: urgencyNormal, Topic: "test"})
	if err != nil {
		return 0, err
	}
	serv.Logger.Info("Тестовое уведомление отправлено",
		slog.Int64("userId", input.UserId), slog.Int("sent", result.Sent), slog.Int("gone", len(result.Gone)))
	switch {
	case result.Sent > 0:
		return result.Sent, nil
	case result.Err != nil:
		return 0, fmt.Errorf("не удалось отправить тестовое уведомление: %w", result.Err)
	default:
		return 0, ErrSubscriptionGone
	}
}

// SendToUser отправляет уведомление на все устройства пользователя; мёртвые подписки удаляются.
// Возвращает число доставленных; ошибка — только если не доставлено никуда из-за сбоя.
func (serv *PushServiceImpl) SendToUser(ctx context.Context, userID int64, msg PushMessage, opts PushOptions) (int, error) {
	subs, err := serv.SubscriptionRepo.FindByUserID(userID)
	if err != nil {
		return 0, fmt.Errorf("ошибка при поиске подписок: %w", err)
	}
	result, err := serv.send(ctx, subs, msg, opts)
	if err != nil {
		return 0, err
	}
	if result.Sent == 0 && result.Err != nil {
		return 0, result.Err
	}
	return result.Sent, nil
}

// send доставляет сообщение и удаляет подписки, которые push-сервис больше не принимает.
func (serv *PushServiceImpl) send(ctx context.Context, subs []*models.PushSubscription, msg PushMessage, opts PushOptions) (deliveryResult, error) {
	vapid, err := serv.credentials()
	if err != nil {
		return deliveryResult{}, err
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return deliveryResult{}, fmt.Errorf("ошибка при подготовке уведомления: %w", err)
	}

	result := deliver(ctx, serv.Sender, vapid, subs, payload, opts, serv.Logger)
	for _, sub := range result.Gone {
		if err := serv.SubscriptionRepo.DeleteByID(sub.SubscriptionId); err != nil {
			serv.Logger.Error("Не удалось удалить устаревшую подписку",
				slog.Int64("subscriptionId", sub.SubscriptionId), slog.String("error", err.Error()))
			continue
		}
		serv.Logger.Info("Устаревшая подписка удалена",
			slog.Int64("userId", sub.UserId), slog.Int64("subscriptionId", sub.SubscriptionId),
			slog.String("pushService", endpointHost(sub.Endpoint)))
	}
	return result, nil
}

// pushOutcome — что делать с подпиской по ответу push-сервиса.
type pushOutcome int

const (
	pushDelivered pushOutcome = iota
	// pushGone — подписки больше нет (404, 410) или она создана с другими VAPID-ключами (403): удалить
	pushGone
	// pushFailed — временный сбой или ошибка запроса: подписку оставить
	pushFailed
)

func classifyPushStatus(status int) pushOutcome {
	switch {
	case status >= 200 && status < 300:
		return pushDelivered
	case status == http.StatusNotFound, status == http.StatusGone, status == http.StatusForbidden:
		return pushGone
	}
	return pushFailed
}

// deliveryResult — итог отправки одного сообщения на несколько подписок.
type deliveryResult struct {
	Sent int
	Gone []*models.PushSubscription // удалить
	Err  error                      // последняя ошибка сбоя (не мёртвой подписки)
}

// deliver отправляет payload на каждую подписку и раскладывает результаты. БД не трогает.
func deliver(ctx context.Context, sender PushSender, vapid VapidCredentials, subs []*models.PushSubscription, payload []byte, opts PushOptions, logger *slog.Logger) deliveryResult {
	var result deliveryResult
	for _, sub := range subs {
		status, err := sender.Send(ctx, vapid, sub, payload, opts)
		if err != nil {
			logger.Warn("Ошибка отправки push",
				slog.Int64("subscriptionId", sub.SubscriptionId), slog.String("error", err.Error()))
			result.Err = err
			continue
		}
		switch classifyPushStatus(status) {
		case pushDelivered:
			result.Sent++
		case pushGone:
			result.Gone = append(result.Gone, sub)
		default:
			logger.Warn("Push-сервис отклонил уведомление",
				slog.Int64("subscriptionId", sub.SubscriptionId),
				slog.String("pushService", endpointHost(sub.Endpoint)),
				slog.Int("status", status))
			result.Err = fmt.Errorf("push-сервис ответил %d", status)
		}
	}
	return result
}
