#!/bin/bash

set -e

echo "=== Kubernetes Deployment Strategies Setup ==="
echo ""

# --- Detect WSL or Native Linux ---
if grep -qi "microsoft" /proc/version; then
    IS_WSL=true
    echo "💻 Environment detected: WSL"
else
    IS_WSL=false
    echo "💻 Environment detected: Ubuntu (native Linux)"
fi

echo ""

# --- Check if Docker is installed ---
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker not found on the system."

    if [ "$IS_WSL" = true ]; then
        echo ""
        echo "⛔ You are running WSL → docker.io CANNOT be installed or used here."
        echo "👉 You MUST install Docker Desktop for Windows:"
        echo "   https://www.docker.com/products/docker-desktop/"
        echo ""
        echo "After installing Docker Desktop, enable the WSL backend."
        exit 1
    else
        # Ubuntu native → offer to install docker.io
        read -p "Do you want to install Docker Engine (docker.io)? (y/n): " choice
        if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
            echo "📦 Installing Docker Engine (docker.io)..."
            sudo apt update
            sudo apt install -y docker.io

            echo "🔧 Adding your user to the docker group..."
            sudo usermod -aG docker $USER

            echo ""
            echo "⚠️ You must log out and log back in for Docker group changes to take effect."
            echo "➡️ After logging back in, re-run this script."
            exit 0
        else
            echo "⛔ Docker is required for Minikube with the docker driver."
            echo "Stopping script."
            exit 1
        fi
    fi
else
    echo "✅ Docker is installed"
fi

echo ""

# --- Check if Minikube is running ---
echo "🔍 Checking Minikube status..."

if ! minikube status >/dev/null 2>&1; then
    echo "🚀 Starting Minikube..."
    minikube start --driver=docker --cpus=2 --memory=4096
else
    echo "💡 Minikube is already running."
fi

echo ""

# --- Enable metrics server ---
echo "📊 Enabling metrics-server addon..."
minikube addons enable metrics-server

echo ""
echo "🎉 Setup completed successfully!"