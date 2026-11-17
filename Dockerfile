# 使用轻量级 Alpine 镜像，Node.js 版本与项目运行环境一致
FROM node:24-alpine

# 标记生产环境；项目无运行时依赖，无需执行 npm install
ENV NODE_ENV=production

# 设置应用工作目录
WORKDIR /app

# 仅复制运行所需文件，并将所有权交给内置 node 用户
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node data ./data

# 使用镜像内置的非 root 用户运行，data 目录仍可正常写入
USER node

# 声明应用监听端口（不会自动映射宿主机端口）
EXPOSE 3000

# 通过 package.json 中的 start 脚本启动服务
CMD ["npm", "start"]
