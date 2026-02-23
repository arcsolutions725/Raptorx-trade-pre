🦖 RaptorX - Intelligent Multi-Chain Trading Intelligence Platform

RaptorX is an advanced AI-powered trading intelligence platform designed for cryptocurrency and prediction market trading. It provides real-time market analysis, technical indicators, and AI-generated trading reports across multiple blockchains including Solana, BNB Smart Chain, and Ethereum/Polygon. The platform also features comprehensive prediction market analysis through Polymarket and Kalshi integrations.

🌟 Key Features

🔍 Rex Screener

- **Multi-Chain Token Analysis**: Monitor trending tokens on Solana and BNB Smart Chain with live price feeds
- **AI-Generated Reports**: Get detailed analysis powered by OpenAI for any token across supported chains
- **Technical Indicators**: Advanced charting with RSI, MACD, Bollinger Bands, and more
- **Dexscreener Integration**: Direct integration with market data APIs
- **BNB Analytics**: Security analytics and holder distribution analysis for BNB Smart Chain tokens
- **Chain Detection**: Automatic chain detection from token addresses and market data

📈 RexMarkets - Prediction Market Intelligence

- **Polymarket Integration**: Full integration with Polymarket for prediction market trading and analysis
- **Kalshi Integration**: Access to Kalshi prediction markets with AI-powered insights
- **Market Reports**: AI-generated analysis for prediction markets and events
- **Market Chat**: Interactive AI assistant for prediction market discussions
- **Trading Support**: Direct trading capabilities for prediction markets
- **Market Analytics**: Real-time market data, order books, and position tracking

🤖 Rex Chat

- **Interactive AI Assistant**: Chat with AI about specific tokens, markets, and trading conditions
- **Conversation History**: Persistent chat sessions tied to generated reports
- **Context-Aware Responses**: AI understands your portfolio and trading history
- **Market-Specific Chat**: Separate chat functionality for prediction markets

💱 Swap & Exchange

- **Multi-Chain Swaps**: Token swaps across supported blockchains
- **LiFi Integration**: Cross-chain swap functionality via LiFi protocol
- **Transaction Tracking**: Track swap transactions and earn points
- **Points System**: Earn points for trading activity

🏆 Gamified Experience

- **Leaderboard System**: Compete with other traders based on activity and performance
- **Daily Missions**: Complete tasks to earn points and climb the rankings
- **Referral Program**: Invite friends and earn rewards
- **User Progress Tracking**: Monitor your trading activity and achievements
- **Points Rewards**: Earn points for reports, swaps, and daily activities

📊 Technical Analysis Suite

- **Multi-timeframe Analysis**: 1m, 5m, 15m, 1h, 4h, 1d charts
- **Volume Analysis**: Track trading volume patterns and anomalies
- **Price Action Indicators**: Support/resistance levels, trend analysis
- **Custom Indicators**: Tailored indicators for DeFi tokens across chains
- **Real-time Data**: Live market data updates and price feeds

🛠️ Technology Stack

**Frontend**
- Next.js 16 with App Router
- React 19 with TypeScript
- TailwindCSS 4 for styling
- Framer Motion for animations
- Recharts for data visualization

**Authentication**
- Privy for Web3 wallet integration (Ethereum, Solana, BNB Smart Chain)
- Phantom wallet direct integration
- Support for multiple wallet providers (MetaMask, Coinbase Wallet, WalletConnect, Phantom, Solflare, Backpack, OKX)

**Database**
- PostgreSQL with Prisma ORM
- Prisma Accelerate for connection pooling

**AI Integration**
- OpenAI GPT for report generation and chat
- AI SDK (Vercel AI) for streaming responses

**Blockchain**
- Solana Web3.js for Solana on-chain data
- Ethers.js for Ethereum/Polygon interactions
- Viem and Wagmi for Ethereum ecosystem
- @solana/kit for Solana wallet management
- LiFi SDK for cross-chain swaps

**APIs & Services**
- Dexscreener API for market data
- CoinGecko API for token information
- Polymarket API for prediction markets
- Kalshi API for prediction markets
- Birdeye API for Solana analytics
- Custom trading APIs

**Deployment**
- Vercel with edge functions
- Vercel Analytics and Speed Insights
- Vercel Blob for file storage

⚡ Performance

- **Optimized for edge**: Next.js 16 App Router, edge functions, streaming SSR
- **Fast data**: Request batching, TanStack Query caching, incremental revalidation
- **Database efficiency**: Prisma with connection pooling and indexed queries
- **UI responsiveness**: React 19 concurrent rendering, memoization, virtualization
- **Assets**: Route-level code splitting, prefetch, and image optimization
- **Reliability**: Debounced inputs, retry with backoff, and rate limiting

🚀 Quick Start

**Prerequisites**

- Node.js 20.18.0 or higher
- PostgreSQL database
- Environment variables (see below)

**Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/Typhon0130/raptorx-trade
   cd raptorx-trade
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/raptorx"
   
   # Privy Authentication
   NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
   PRIVY_APP_SECRET="your_privy_app_secret"
   
   # OpenAI
   OPENAI_API_KEY="your_openai_api_key"
   
   # API Keys (optional)
   DEXSCREENER_API_KEY="your_dexscreener_key"
   COINGECKO_API_KEY="your_coingecko_key"
   
   # Blockchain RPC URLs (optional, defaults provided)
   POLYGON_RPC_URL="your_polygon_rpc_url"
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open the application**
   
   Navigate to http://localhost:3000

📖 Usage Guide

**Getting Started**

1. **Connect Your Wallet**: Use Privy or Phantom to connect your wallet (supports Solana, Ethereum, or BNB Smart Chain)
2. **Explore Trending Tokens**: Browse the real-time trending table on the main page (filter by chain)
3. **Generate Reports**: Click on any token to generate an AI-powered analysis report
4. **Use Technical Analysis**: View detailed charts and indicators for informed trading decisions
5. **Chat with Rex**: Ask questions about tokens, market conditions, or trading strategies
6. **Access RexMarkets**: Navigate to `/rexmarkets` for prediction market analysis and trading

**Daily Missions**

Complete daily tasks to earn points:
- Generate trading reports
- Use the chat feature
- Analyze technical indicators
- Share referral links
- Execute swaps

**Advanced Features**

- **Multi-Chain Support**: Switch between Solana, BNB Smart Chain, and Ethereum networks
- **Report History**: Review past analyses and track your predictions
- **System Reports**: Access pre-generated reports for popular tokens
- **Social Features**: Share reports and compete on leaderboards
- **Swap Tracking**: Monitor your swap transactions and earn points
- **Prediction Markets**: Trade and analyze markets on Polymarket and Kalshi

🏗️ Architecture

**Frontend Structure**

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── bnb-analytics/  # BNB chain analytics
│   │   ├── chat/           # AI chat endpoints
│   │   ├── generate-report/# Crypto report generation
│   │   ├── generate-market-report/ # Market report generation
│   │   ├── kalshi/         # Kalshi API integration
│   │   ├── polymarket/     # Polymarket API integration
│   │   ├── swaps/          # Swap transaction tracking
│   │   └── ...
│   ├── rexmarkets/         # Prediction markets section
│   ├── claw-v5/            # Additional features
│   └── page.tsx            # Main application page
├── components/             # React components
│   ├── rexscreener/        # Token analysis components
│   ├── leaderboard/        # Gamification features
│   ├── swap/               # Swap functionality
│   ├── analytics/          # Analytics components
│   └── providers/          # Context providers
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions
│   ├── api/                # API client functions
│   ├── auth/               # Authentication utilities
│   └── utils/              # General utilities
├── contexts/               # React contexts
├── providers/              # App providers
├── types/                  # TypeScript type definitions
└── utils/                  # Helper functions
```

**API Endpoints**

**Crypto Trading**
- `/api/trending` - Real-time token data across chains
- `/api/generate-report` - AI crypto report generation
- `/api/regenerate-report` - Regenerate existing reports
- `/api/technical-analysis` - Technical indicators
- `/api/reports` - Report management
- `/api/systemreports` - System-generated reports
- `/api/bnb-analytics` - BNB chain security analytics

**AI & Chat**
- `/api/chat` - AI chat functionality for crypto
- `/api/market-chat` - AI chat for prediction markets
- `/api/conversations/[reportId]/message` - Conversation management

**Prediction Markets**
- `/api/polymarket/*` - Polymarket integration (markets, orderbook, positions, etc.)
- `/api/kalshi/*` - Kalshi integration (markets, categories, series, etc.)
- `/api/generate-market-report` - AI market report generation

**User & Social**
- `/api/user` - User management
- `/api/leaderboard` - User rankings and points
- `/api/daily-tasks` - Mission system
- `/api/referral` - Referral program

**Trading**
- `/api/swaps/points` - Swap transaction points

**Data**
- `/api/dexscreener` - Dexscreener data
- `/api/crypto/top` - Top tokens data

🔧 Development

**Database Management**

```bash
# Generate Prisma client
npm run db:generate
# or
npx prisma generate

# Push schema changes
npm run db:push
# or
npx prisma db push

# Create migration
npm run db:migrate
# or
npx prisma migrate dev

# View database
npm run db:studio
# or
npx prisma studio

# Reset database (WARNING: deletes all data)
npm run db:reset
```

**Code Quality**

```bash
# Run linting
npm run lint

# Type checking
npx tsc --noEmit

# Build the application
npm run build
```

**Available Scripts**

- `npm run dev` - Start development server
- `npm run build` - Build for production (includes db push and prisma generate)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

🌐 Deployment

**Vercel Deployment**

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

**Environment Variables for Production**

Ensure all required environment variables are set in your production environment:

- Database connection strings (DATABASE_URL)
- API keys for external services (OpenAI, Dexscreener, CoinGecko, etc.)
- Authentication secrets (Privy App ID and Secret)
- RPC URLs for blockchain networks

**Build Process**

The build process automatically:
1. Pushes database schema changes
2. Generates Prisma client
3. Builds Next.js application

🤝 Contributing

We welcome contributions to RaptorX! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feat/amazing-feature`
5. Open a Pull Request

**Development Guidelines**

- Follow TypeScript best practices
- Write meaningful commit messages
- Test your changes thoroughly
- Update documentation as needed
- Ensure all linting checks pass

📄 License

This project is proprietary software. All rights reserved.

🆘 Support

For support and questions:

- Create an issue in this repository
- Join our Discord community
- Email: support@raptorx.trade

🚧 Roadmap

**Upcoming Features**

- Mobile app (React Native)
- Advanced portfolio tracking
- Automated trading signals
- NFT collection analysis
- Advanced charting tools
- Social trading features
- More prediction market integrations
- Enhanced cross-chain swap capabilities

**Recently Added**

- ✅ Multi-chain support (Solana, BNB Smart Chain, Ethereum/Polygon)
- ✅ Polymarket integration
- ✅ Kalshi integration
- ✅ BNB analytics
- ✅ Swap functionality
- ✅ Phantom wallet direct integration

---

Built with ❤️ for the crypto and DeFi community

RaptorX - Where AI meets multi-chain trading intelligence
