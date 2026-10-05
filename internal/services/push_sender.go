package services

import (
	"TaskManager/internal/models"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// VapidCredentials — ключи и subject, которыми сервер подписывает запросы к push-сервису.
type VapidCredentials struct {
	PublicKey  string // base64url
	PrivateKey string // base64url; не логировать
	Subject    string // mailto:… или https://…
}

// PushSender отправляет одно уведомление на одну подписку. Возвращает HTTP-статус ответа
// push-сервиса; ошибка — сеть, шифрование или неверные ключи (статус тогда 0).
// Интерфейс нужен, чтобы в тестах подменить настоящий push-сервис.
type PushSender interface {
	Send(ctx context.Context, vapid VapidCredentials, sub *models.PushSubscription, payload []byte, opts PushOptions) (int, error)
}

// WebPushSender — отправка по протоколу Web Push (RFC 8030) с VAPID через webpush-go.
type WebPushSender struct {
	Client *http.Client
}

func NewWebPushSender() *WebPushSender {
	return &WebPushSender{Client: &http.Client{
		Timeout: 30 * time.Second,
		// Редиректы не выполняем: адрес подписки проверен по списку push-сервисов,
		// а редирект увёл бы запрос на произвольный адрес (SSRF). Ответ 3xx считается сбоем.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (sender *WebPushSender) Send(ctx context.Context, vapid VapidCredentials, sub *models.PushSubscription, payload []byte, opts PushOptions) (int, error) {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		HTTPClient: sender.Client,
		// webpush-go v1.4 сам добавляет «mailto:» к subject, если он не https://, поэтому префикс убираем
		Subscriber:      strings.TrimPrefix(vapid.Subject, "mailto:"),
		Topic:           opts.Topic,
		TTL:             max(int(opts.TTL.Seconds()), 0),
		Urgency:         webpush.Urgency(opts.Urgency),
		VAPIDPublicKey:  vapid.PublicKey,
		VAPIDPrivateKey: vapid.PrivateKey,
	})
	if err != nil {
		return 0, fmt.Errorf("ошибка при отправке push: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	return resp.StatusCode, nil
}
