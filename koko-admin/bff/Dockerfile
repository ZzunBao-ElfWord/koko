# syntax=docker/dockerfile:1

# ---------- stage 1: 构建前端 ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json ./
COPY web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- stage 2: 构建 BFF（嵌入前端产物） ----------
FROM golang:1.27-alpine AS api
WORKDIR /src
COPY bff/ ./
COPY --from=web /web/dist ./internal/web/dist
RUN go mod tidy \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- stage 3: 运行（distroless，单二进制 + 嵌入静态资源） ----------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=api /out/server /app/server
EXPOSE 8093
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
