This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

# ShadChat

A professional, streamlined AI chat interface built with **Next.js 15**, **React 19**, and **Shadcn UI**. ShadChat provides a unified platform to interact with multiple LLM providers through a beautiful, responsive, and performance-optimized UI.

## ✨ Features

- **Multi-Provider Support**: Integrated with Google Gemini, Anthropic Claude, OpenAI, xAI Grok, Groq, and OpenRouter.
- **Dynamic Model Fetching**: Automatically fetches and lists available models for each provider (where supported).
- **Cost Tracking**: Real-time estimation of conversation costs based on token usage.
- **Context Management**: Visual indicators for token usage and context window limits.
- **Rich Media**: Support for image and document attachments (provider-dependent).
- **Conversational Experience**: Streaming responses, message retries, and markdown rendering with GFM support.
- **Smart Sidebar**: Organize chats with pinning, renaming, and local persistence.
- **Premium UI**: Modern dark/light mode toggle, sleek animations, and responsive design.

## 🚀 Tech Stack

- **Next.js 15 (App Router)** & **React 19**
- **Tailwind CSS 4** for styling
- **Shadcn UI** for high-quality accessible components
- **Lucide React** for consistent iconography
- **Local Storage** for state persistence and security

## 🛠️ Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/KuzeyMurathan/shadchat.git
    cd shadchat
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    ```

4.  **Configure API Keys**:
    Open the application in your browser, navigate to **Settings**, and add your API keys for the desired providers.

## 🔐 Privacy

ShadChat is a client-side first application. Your API keys and conversation history are stored locally in your browser and are never sent to a middleman server — they go directly to the LLM providers.

---
Built with ❤️ for a better AI experience.
