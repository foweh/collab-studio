FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制源码
COPY . .

# 创建数据目录
RUN mkdir -p data

EXPOSE 3000
EXPOSE 41234/udp

# 管理员密码需通过环境变量设置
ENV ADMIN_PASSWORD=""
ENV PORT=3000

CMD ["node", "server.js"]
