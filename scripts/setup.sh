#!/bin/bash

set -e

echo "=== Kubernetes Deployment Strategies Setup ==="

# Check if minikube is running
if ! minikube status >/dev/null 2>&1; then
    echo "Starting minikube..."
    minikube start --driver=docker --cpus=2 --memory=4096
else
    echo "Minikube is already running"
fi

# Enable metrics server for HPA
minikube addons enable metrics-server

echo "✅ Setup completed!"