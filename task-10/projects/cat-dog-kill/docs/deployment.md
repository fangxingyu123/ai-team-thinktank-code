# 🚀 猫狗杀 - 部署指南

## 1. 环境要求

### 1.1 开发环境
- Node.js 18+
- npm 9+
- Docker & Docker Compose
- Xcode 15+ (iOS 开发)
- Swift 5.9+

### 1.2 生产环境
- Linux 服务器 (Ubuntu 20.04+ 推荐)
- 2 vCPU / 4GB RAM (最低配置)
- 20GB 存储空间
- 开放端口: 80, 443, 3000

## 2. 后端部署

### 2.1 使用 Docker Compose (推荐)

```bash
# 1. 进入后端目录
cd backend

# 2. 复制环境变量文件
cp .env.example .env

# 3. 编辑环境变量
vim .env

# 4. 启动服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f server
```

### 2.2 手动部署

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run build

# 3. 启动服务
npm start
```

### 2.3 环境变量配置

```env
# 服务器配置
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-domain.com

# MongoDB 配置
MONGODB_URI=mongodb://admin:password@localhost:27017/catdogkill?authSource=admin

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# JWT 配置
JWT_SECRET=your-super-secret-key-min-32-characters
JWT_EXPIRES_IN=7d

# 日志配置
LOG_LEVEL=info
```

## 3. iOS 部署

### 3.1 开发环境配置

```bash
# 1. 进入 iOS 项目目录
cd ios/CatDogKill

# 2. 安装依赖 (如果使用 CocoaPods)
pod install

# 3. 打开项目
open CatDogKill.xcworkspace
```

### 3.2 修改服务器地址

在 `SocketService.swift` 中修改服务器地址:

```swift
// 开发环境
manager = SocketManager(socketURL: URL(string: "http://localhost:3000")!, config: config)

// 生产环境
manager = SocketManager(socketURL: URL(string: "https://your-domain.com")!, config: config)
```

### 3.3 打包发布

1. 在 Xcode 中选择 Product > Archive
2. 选择 Distribute App
3. 选择 App Store Connect
4. 按照向导完成上传

## 4. 生产环境配置

### 4.1 Nginx 反向代理

```nginx
# /etc/nginx/sites-available/catdogkill
server {
    listen 80;
    server_name your-domain.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # WebSocket 支持
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
    
    # API 代理
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4.2 启用配置

```bash
sudo ln -s /etc/nginx/sites-available/catdogkill /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4.3 使用 PM2 管理 Node 进程

```bash
# 安装 PM2
npm install -g pm2

# 创建配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'catdogkill',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
}
EOF

# 启动
pm2 start ecosystem.config.js

# 保存配置
pm2 save
pm2 startup
```

## 5. 监控与日志

### 5.1 日志查看

```bash
# Docker 日志
docker-compose logs -f server

# PM2 日志
pm2 logs catdogkill

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 5.2 健康检查

```bash
# 检查服务状态
curl https://your-domain.com/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

## 6. 备份策略

### 6.1 数据库备份

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/mongodb"

# 创建备份
mongodump --out $BACKUP_DIR/$DATE

# 压缩
tar -czf $BACKUP_DIR/$DATE.tar.gz -C $BACKUP_DIR $DATE
rm -rf $BACKUP_DIR/$DATE

# 删除 7 天前的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

添加到 crontab:
```bash
0 2 * * * /path/to/backup.sh
```

### 6.2 配置文件备份

```bash
# 备份重要配置文件
tar -czf backup-config-$(date +%Y%m%d).tar.gz \
  .env \
  docker-compose.yml \
  nginx.conf \
  ecosystem.config.js
```

## 7. 更新部署

### 7.1 后端更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建
docker-compose build

# 3. 重启服务
docker-compose up -d

# 4. 清理旧镜像
docker image prune -f
```

### 7.2 零停机更新 (使用 PM2)

```bash
# 1. 拉取代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 零停机重启
pm2 reload catdogkill
```

## 8. 故障排查

### 8.1 常见问题

#### 服务无法启动
```bash
# 检查端口占用
sudo lsof -i :3000

# 检查环境变量
cat .env

# 查看详细错误日志
docker-compose logs --tail=100 server
```

#### WebSocket 连接失败
```bash
# 检查 Nginx 配置
sudo nginx -t

# 检查防火墙
sudo ufw status

# 测试 WebSocket
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: your-domain.com" \
  -H "Origin: https://your-domain.com" \
  https://your-domain.com/socket.io/?EIO=4&transport=websocket
```

#### 数据库连接失败
```bash
# 检查 MongoDB 状态
docker-compose ps

# 检查连接
mongosh "mongodb://admin:password@localhost:27017/catdogkill?authSource=admin"

# 查看 MongoDB 日志
docker-compose logs mongodb
```

### 8.2 性能优化

#### 增加服务器实例
```bash
# 修改 PM2 配置
pm2 scale catdogkill +2
```

#### 数据库优化
```bash
# 创建索引
mongosh catdogkill --eval '
  db.users.createIndex({ username: 1 }, { unique: true });
  db.gameRecords.createIndex({ startTime: -1 });
'
```

## 9. 安全加固

### 9.1 防火墙配置

```bash
# 允许必要端口
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable
```

### 9.2 SSL 证书

```bash
# 使用 Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 9.3 安全头部

在 Nginx 配置中添加:
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## 10. 扩容方案

### 10.1 水平扩容

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  server:
    deploy:
      replicas: 3
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### 10.2 使用 Kubernetes

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: catdogkill
spec:
  replicas: 3
  selector:
    matchLabels:
      app: catdogkill
  template:
    metadata:
      labels:
        app: catdogkill
    spec:
      containers:
      - name: server
        image: catdogkill:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
```
