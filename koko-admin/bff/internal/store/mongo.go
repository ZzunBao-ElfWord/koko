package store

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Connect 建立 MongoDB 连接并在 10 秒内完成 Ping。
// 连接串中的账号权限由 deploy/mongo-init.js 限定（最小权限）。
func Connect(ctx context.Context, uri string) (*mongo.Client, error) {
	ctxPing, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctxPing, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctxPing, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}
	return client, nil
}
