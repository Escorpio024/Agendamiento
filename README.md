# Clínica LLM - WhatsApp Bot & Scheduling System

This is the backend repository for the Clínica WhatsApp Bot and Scheduling System. It integrates WhatsApp with a medical system using natural language processing through OpenAI.

## Prerequisites

- **Node.js**: v18 or higher recommended
- **SQL Server**: Access to the `HABEJICO` database (or any other required by `schema.prisma`)
- **Docker** (optional): If you want to run `postgres` or `ollama` via Docker Compose.

## Environment Variables

Copy the example environment variables file and configure it with your credentials:

```bash
cp .env.example .env
```

Ensure you update `.env` with:
- `DATABASE_URL`: Connection string to your SQL Server instance
- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_MODEL`: The OpenAI model to use (default: \`gpt-4.1-nano\`)

## Installation

Install dependencies using npm:

```bash
npm install
```

## Running the Application

To start the server, run:

```bash
npm start
```

Upon the first execution, WhatsApp Web JS will require you to scan a QR code through your mobile WhatsApp application. The QR code will be generated in your terminal.

## Database Management

This project uses Prisma ORM.

To generate the Prisma Client based on the current schema:

```bash
npx prisma generate
```

To pull the current database structure into Prisma (if it has changed):

```bash
npx prisma db pull
```
