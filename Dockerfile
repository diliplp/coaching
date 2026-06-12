# Stage 1: Build the backend and frontend
FROM node:18-bookworm-slim AS builder
WORKDIR /app

# Install build essentials for native modules if needed
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime image
FROM node:18-bookworm-slim
WORKDIR /app

# Install system dependencies: python3, pip, tesseract-ocr, chromium, and all runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends --fix-missing \
    python3 \
    python3-pip \
    python3-venv \
    tesseract-ocr \
    tesseract-ocr-eng \
    chromium \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev

# Copy built code from builder stage
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/backend/scripts ./backend/scripts

# Copy requirements.txt and install Python dependencies
COPY requirements.txt .
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Add venv to PATH so python3 commands use it
ENV PATH="/opt/venv/bin:$PATH"

# Tell Puppeteer to use the installed Chromium package
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Environment variables
ENV NODE_ENV=production
ENV PORT=3030

EXPOSE 3030

CMD ["node", "backend/dist/index.js"]
