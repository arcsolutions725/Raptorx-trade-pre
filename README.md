🦖 RaptorX - The Bloomberg Intelligence Terminal for the trenches.

RaptorX is an advanced AI-powered trading intelligence platform specifically designed for the Solana ecosystem. It provides real-time market analysis, technical indicators, and AI-generated trading reports to help traders make informed decisions in the fast-paced world of cryptocurrency trading.

🌟 Key Features

🔍 Rex Screener

Real-time Token Analysis: Monitor trending tokens on Solana with live price feeds

AI-Generated Reports: Get detailed analysis powered by OpenAI for any token

Technical Indicators: Advanced charting with RSI, MACD, Bollinger Bands, and more

Dexscreener Integration: Direct integration with market data APIs

🤖 Rex Chat

Interactive AI Assistant: Chat with AI about specific tokens and market conditions

Conversation History: Persistent chat sessions tied to generated reports

Context-Aware Responses: AI understands your portfolio and trading history

🏆 Gamified Experience

Leaderboard System: Compete with other traders based on activity and performance

Daily Missions: Complete tasks to earn points and climb the rankings

Referral Program: Invite friends and earn rewards

User Progress Tracking: Monitor your trading activity and achievements

📊 Technical Analysis Suite

Multi-timeframe Analysis: 1m, 5m, 15m, 1h, 4h, 1d charts

Volume Analysis: Track trading volume patterns and anomalies

Price Action Indicators: Support/resistance levels, trend analysis

Custom Indicators: Tailored indicators for Solana DeFi tokens

🛠️ Technology Stack

Frontend: Next.js 15 with React 19, TypeScript, TailwindCSS

Authentication: Privy for Web3 wallet integration

Database: PostgreSQL with Prisma ORM

AI Integration: OpenAI GPT for report generation and chat

Blockchain: Solana Web3.js for on-chain data

APIs: Dexscreener, CoinGecko, custom trading APIs

Deployment: Vercel with edge functions

🚀 Quick Start

Prerequisites

Node.js 20.18.0 or higher

PostgreSQL database

Environment variables (see below)

Installation

Clone the repository

git clone https://github.com/your-repo/raptorx-trade.git
cd raptorx-trade

Install dependencies

npm ci

Set up environment variables Create a .env.local file in the root directory:

# Database

DATABASE_URL="postgresql://username:password@localhost:5432/raptorx"

# Privy Authentication

NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
PRIVY_APP_SECRET="your_privy_app_secret"

# OpenAI

OPENAI_API_KEY="your_openai_api_key"

# API Keys

DEXSCREENER_API_KEY="your_dexscreener_key"
COINGECKO_API_KEY="your_coingecko_key"

Set up the database

npx prisma generate
npx prisma db push

Run the development server

npm run dev

Open the application Navigate to http://localhost:3000

📖 Usage Guide

Getting Started

Connect Your Wallet: Use the Privy integration to connect your Solana wallet

Explore Trending Tokens: Browse the real-time trending table on the main page

Generate Reports: Click on any token to generate an AI-powered analysis report

Use Technical Analysis: View detailed charts and indicators for informed trading decisions

Chat with Rex: Ask questions about tokens, market conditions, or trading strategies

Daily Missions

Complete daily tasks to earn points:

Generate trading reports

Use the chat feature

Analyze technical indicators

Share referral links

Advanced Features

Custom Watchlists: Save favorite tokens for quick access

Report History: Review past analyses and track your predictions

Social Features: Share reports and compete on leaderboards

API Access: Integrate RaptorX data into your own trading tools

🏗️ Architecture

Frontend Structure

src/
├── app/ # Next.js App Router
│ ├── api/ # API routes
│ └── page.tsx # Main application page
├── components/ # React components
│ ├── rexscreener/ # Token analysis components
│ ├── leaderboard/ # Gamification features
│ └── providers/ # Context providers
├── hooks/ # Custom React hooks
├── lib/ # Utility functions
└── prisma/ # Database schema

API Endpoints

/api/trending - Real-time token data

/api/generate-report - AI report generation

/api/technical-analysis - Technical indicators

/api/chat - AI chat functionality

/api/leaderboard - User rankings and points

/api/daily-tasks - Mission system

🔧 Development

Database Management

# Generate Prisma client

npx prisma generate

# Push schema changes

npx prisma db push

# View database

npx prisma studio

Code Quality

# Run linting

npm run lint

# Type checking

npx tsc --noEmit

# Build the application

npm run build

Testing

# Run tests (when available)

npm test

# Run E2E tests (when available)

npm run test:e2e

🌐 Deployment

Vercel Deployment

Connect your GitHub repository to Vercel

Set environment variables in Vercel dashboard

Deploy automatically on push to main branch

Environment Variables for Production

Ensure all required environment variables are set in your production environment:

Database connection strings

API keys for external services

Authentication secrets

🤝 Contributing

We welcome contributions to RaptorX! Please follow these guidelines:

Fork the repository

Create a feature branch: git checkout -b feat/amazing-feature

Commit your changes: git commit -m 'Add amazing feature'

Push to the branch: git push origin feat/amazing-feature

Open a Pull Request

Development Guidelines

Follow TypeScript best practices

Write meaningful commit messages

Test your changes thoroughly

Update documentation as needed

📄 License

This project is proprietary software. All rights reserved.

🆘 Support

For support and questions:

Create an issue in this repository

Join our Discord community

Email: support@raptorx.trade

🚧 Roadmap

Upcoming Features

Mobile app (React Native)

Advanced portfolio tracking

Automated trading signals

NFT collection analysis

Cross-chain support (Ethereum, BSC)

Advanced charting tools

Social trading features

Built with ❤️ for the Solana community

RaptorX - Where AI meets DeFi trading intelligence
