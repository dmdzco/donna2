#!/bin/bash
# ============================================
# Donna Mobile App — MacInCloud Setup Script
# ============================================
# Run this in Terminal on your MacInCloud Mac.
# It will set up everything needed to run the
# Donna app in the iOS Simulator.
# ============================================

set -e

echo "========================================="
echo "  Donna Mobile App — MacInCloud Setup"
echo "========================================="
echo ""

# ----- Step 1: Check / Install Node.js -----
echo "[1/6] Checking Node.js..."
if command -v node &> /dev/null; then
    echo "  ✓ Node.js $(node -v) already installed"
else
    echo "  Installing Node.js via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "  Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
    echo "  ✓ Node.js installed: $(node -v)"
fi

# ----- Step 2: Clone the repo -----
echo ""
echo "[2/6] Cloning the repo..."
if [ -d "$HOME/donna/.git" ]; then
    echo "  Repo already exists at ~/donna — pulling latest..."
    cd ~/donna
    git pull
else
    git clone https://github.com/dmdzco/donna2.git ~/donna
    cd ~/donna
fi
echo "  ✓ Repo ready at ~/donna"

# ----- Step 3: Install project dependencies -----
echo ""
echo "[3/6] Installing project dependencies..."
cd ~/donna
npm install
cd ~/donna/apps/mobile
npm install
echo "  ✓ Dependencies installed"

# ----- Step 4: Install Expo CLI & EAS CLI -----
echo ""
echo "[4/6] Installing Expo CLI & EAS CLI..."
npm install -g expo-cli eas-cli
echo "  ✓ Expo CLI and EAS CLI installed"

# ----- Step 5: Accept Xcode license -----
echo ""
echo "[5/6] Accepting Xcode license (may ask for password)..."
sudo xcodebuild -license accept 2>/dev/null || echo "  (License may already be accepted)"
echo "  ✓ Xcode license accepted"

# ----- Step 6: Create .env file -----
echo ""
echo "[6/6] Checking .env file..."
if [ -f ~/donna/apps/mobile/.env ]; then
    echo "  ✓ .env already exists — skipping"
else
    cat > ~/donna/apps/mobile/.env << 'ENVFILE'
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_CLERK_KEY_HERE
EXPO_PUBLIC_API_URL=YOUR_RAILWAY_API_URL_HERE
ENVFILE
    echo "  ⚠ Created .env with placeholder values."
    echo "    You MUST edit ~/donna/apps/mobile/.env"
    echo "    and fill in your real keys before running the app."
fi

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Edit the .env file with your real keys:"
echo "     nano ~/donna/apps/mobile/.env"
echo ""
echo "  2. Run the app in the iOS Simulator:"
echo "     cd ~/donna/apps/mobile"
echo "     npx expo start --ios"
echo ""
echo "  3. Install Claude Code (in a new Terminal tab):"
echo "     npm install -g @anthropic-ai/claude-code"
echo "     cd ~/donna"
echo "     claude"
echo ""
echo "  Then describe your edits to Claude Code and"
echo "  watch them hot-reload in the simulator!"
echo "========================================="
