# InvoiceManage 发票报销系统

发票报销管理系统，后端基于 Django + Django REST Framework，前端基于 Vue 3 + Vite，数据存储使用 MySQL。支持发票上传与解析、差旅报销单管理、审批及导出等流程。

## 技术栈

- **后端**：Python 3.11+、Django 5.2、Django REST Framework、SimpleJWT、MySQL 8
- **前端**：Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router
- **包管理**：后端使用 [uv](https://docs.astral.sh/uv/)，前端使用 npm

## 目录结构

```
InvoiceManage/
├── InvoiceManageBack/       # Django 后端
│   ├── config/              # 项目配置、路由与测试配置
│   ├── core/                # 发票、报销、用户等业务代码
│   ├── media/               # 上传文件与导出模板（上传的发票原件不入库）
│   ├── tools/               # PDF 解析等工具模块
│   └── .env.example         # 环境变量模板
└── InvoiceManageFront/      # Vue 3 前端
    ├── src/views/           # 页面
    ├── src/stores/          # Pinia 状态
    └── vite.config.ts       # 开发服务器与接口代理配置
```

## 环境要求

| 依赖 | 版本/说明 |
| --- | --- |
| Python | 3.11 及以上 |
| uv | 最新版即可，用于安装后端依赖和管理虚拟环境 |
| Node.js | `^20.19.0` 或 `>=22.12.0`（见 `package.json` 的 `engines`），npm 随 Node.js 安装 |
| MySQL | 8.0 及以上 |
| 编译依赖 | `pkg-config` 与 MySQL 客户端开发库，用于编译 Python 的 `mysqlclient` |

`mysqlclient` 需要本机具备 MySQL 头文件。缺少时 `uv sync` 会报 `Can not find valid pkg-config name` 或找不到 `mysql.h`。按系统安装：

```bash
# Ubuntu / Debian
sudo apt install pkg-config libmysqlclient-dev

# macOS (Homebrew)
brew install mysql pkg-config
```

## 本地开发

本地开发需要同时启动后端和前端：后端默认监听 `8000` 端口，前端默认监听 `5173` 端口，前端的 `/api`、`/media` 请求会代理到 `http://localhost:8000`。

### 1. 准备数据库

确保本机 MySQL 服务已启动（例如 `sudo systemctl start mysql`），然后登录 MySQL：

```bash
mysql -u root -p
```

创建数据库和业务用户（密码请替换为实际值）：

```sql
CREATE DATABASE invoice_manage
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'invoice_user'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON invoice_manage.* TO 'invoice_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 启动后端

```bash
cd InvoiceManageBack

# 创建本地环境变量文件，并按注释替换示例值
cp .env.example .env

# 安装依赖（首次执行会自动创建 .venv）
uv sync

# 初始化数据库表
uv run python manage.py migrate

# 创建管理员账号，用于登录系统与 /admin/ 后台
uv run python manage.py createsuperuser

# 启动开发服务器：http://localhost:8000
uv run python manage.py runserver
```

`.env` 中的 `DJANGO_SECRET_KEY` 和 `DB_PASSWORD` 为必填项，缺失时启动会抛出 `KeyError`；其余配置可用默认值，`DB_NAME`、`DB_USER`、`DB_HOST`、`DB_PORT` 需与上一步创建的数据库一致。可用 `openssl rand -hex 32` 生成 `DJANGO_SECRET_KEY`。

后端启动后可访问：

- 管理后台：<http://localhost:8000/admin/>
- API 根路径：<http://localhost:8000/api/>

### 3. 启动前端

另开一个终端：

```bash
cd InvoiceManageFront
npm install
npm run dev
```

按终端提示打开页面（默认 <http://localhost:5173/>）。开发代理写在 `InvoiceManageFront/vite.config.ts`，如果后端端口不是 `8000`，需要同步修改代理目标。

其他常用命令：

```bash
npm run type-check   # 仅执行 TypeScript 类型检查
npm run build        # 类型检查并打包到 dist/
```

### 4. 运行测试

后端测试使用 SQLite，不依赖本地 MySQL：

```bash
cd InvoiceManageBack
uv run python manage.py test --settings=config.test_settings
```

测试配置会先加载 `config/settings.py`，因此运行测试时仍然需要存在 `InvoiceManageBack/.env` 且包含 `DJANGO_SECRET_KEY`、`DB_PASSWORD`。

## 常用管理命令

以下命令均在 `InvoiceManageBack` 目录下执行：

```bash
# 修改模型后生成并应用迁移
uv run python manage.py makemigrations
uv run python manage.py migrate

# 单次执行邮箱发票抓取
uv run python manage.py poll_emails --once

# 后台循环抓取邮箱发票（每 60 秒检查一次到期的邮箱账户）
uv run python manage.py poll_emails --interval 60
```

其余命令可通过 `uv run python manage.py help` 查看。

## 注意事项

- 上传的发票和附件保存在 `InvoiceManageBack/media/invoices/` 与 `InvoiceManageBack/media/invoice-attachments/`，相关路径与 `*.pdf` 已在 `.gitignore` 中忽略，请勿提交真实发票或个人数据。
- 当前配置面向本地开发：`DEBUG = True`、`ALLOWED_HOSTS = ['*']`、允许所有来源的 CORS 请求，请勿直接用于生产环境。
- 后端默认只监听 `127.0.0.1:8000`。如果修改了端口，请同时更新前端代理配置，否则页面会请求失败。

## 相关文档

- 后端工具模块说明：[InvoiceManageBack/tools/README.md](InvoiceManageBack/tools/README.md)
- 前端目录说明：[InvoiceManageFront/README.md](InvoiceManageFront/README.md)
