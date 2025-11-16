#!/bin/bash

echo "🧨 NUKE EVERYTHING - Cleanup Total"
echo "===================================="

# Stop and delete Minikube
echo "1. Stopping and deleting Minikube..."
minikube stop 2>/dev/null || true
minikube delete --all --purge 2>/dev/null || true

# Delete all Kubernetes resources in all namespaces
echo "2. Deleting all Kubernetes resources..."
kubectl delete all --all --all-namespaces --timeout=30s 2>/dev/null || true

# Delete all namespaces (except default and system)
echo "3. Deleting custom namespaces..."
kubectl get namespaces --no-headers | awk '{print $1}' | grep -v -E "(default|kube-system|kube-public|kube-node-lease|local-path-storage)" | xargs -r kubectl delete namespace 2>/dev/null || true

# Delete all CRDs
echo "4. Deleting Custom Resource Definitions..."
kubectl get crd --no-headers | awk '{print $1}' | xargs -r kubectl delete crd --timeout=30s 2>/dev/null || true

# Clean Docker
echo "5. Cleaning Docker resources..."
docker container prune -f 2>/dev/null || true
docker image prune -a -f 2>/dev/null || true
docker network prune -f 2>/dev/null || true
docker volume prune -f 2>/dev/null || true
docker system prune -a -f --volumes 2>/dev/null || true

# Remove Minikube and kubectl configurations
echo "6. Cleaning configuration files..."
rm -rf ~/.minikube 2>/dev/null || true
rm -rf ~/.kube/cache/minikube 2>/dev/null || true

# Remove kubectl context and cluster
echo "7. Cleaning kubectl config..."
kubectl config delete-context minikube 2>/dev/null || true
kubectl config delete-cluster minikube 2>/dev/null || true
kubectl config unset users.minikube 2>/dev/null || true

# Delete specific images
echo "8. Deleting application images..."
docker rmi my-app:blue my-app:green 2>/dev/null || true
docker rmi $(docker images "my-app*" -q) 2>/dev/null || true

# Clean temporary files
echo "9. Cleaning temporary files..."
rm -f kubectl-argo-rollouts-linux-amd64 2>/dev/null || true

# Final verification
echo "10. Final verification..."
echo "📋 Current status:"
echo "   - Docker images: $(docker images | grep -c "my-app") my-app images remaining"
echo "   - Kubernetes contexts: $(kubectl config get-contexts --no-headers | wc -l)"
echo "   - Minikube status: $(minikube status 2>/dev/null | head -1 || echo "Not running")"

echo ""
echo "✅ ¡Clean complete! We can start from 0."
echo "💡 Execute './scripts/setup.sh' for a clean install."