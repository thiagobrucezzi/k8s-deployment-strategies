#!/bin/bash

set -e

echo "🚀 Starting Comprehensive k6 Load Tests..."
echo "==========================================="

K6_NAMESPACE="${K6_NAMESPACE:-default}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:latest}"

run_test() {
    local test_name=$1
    local test_file=$2
    local service_type=$3

    echo ""
    echo "🧪 Running $test_name..."
    echo "----------------------------"

    local pod_name="k6-${service_type}-test-$(date +%s)"

    if kubectl run "$pod_name" \
        --namespace="$K6_NAMESPACE" \
        --image="$K6_IMAGE" \
        --rm -i --quiet --restart=Never -- \
        run - < "load-test/${test_file}" 2>/dev/null; then
        echo "✅ $test_name completed successfully"
        return 0
    else
        echo "❌ $test_name failed"
        return 1
    fi
}

check_test_files() {
    local files=("canary-test.js" "blue-green-test.js")
    for file in "${files[@]}"; do
        if [[ ! -f "load-test/${file}" ]]; then
            echo "❌ Test file load-test/${file} not found!"
            exit 1
        fi
    done
    echo "✅ All test files present"
}

echo "🔍 Checking service availability..."
kubectl get svc canary-canary canary-stable service-canary >/dev/null 2>&1 && echo "✅ Canary services available"
kubectl get svc blue-green-active blue-green-preview >/dev/null 2>&1 && echo "✅ Blue-Green services available"

echo ""
echo "📋 Test Sequence:"
check_test_files
echo ""

echo "1. Canary Deployment Test"
run_test "Canary Deployment" "canary-test.js" "canary"

echo ""
echo "2. Blue-Green Active Service Test"
run_test "Blue-Green Active" "blue-green-test.js" "blue-green-active"

echo ""
echo "3. Blue-Green Preview Service Test"
run_test "Blue-Green Preview" "blue-green-test.js" "blue-green-preview"

echo ""
echo "==========================================="
echo "🎉 All load tests completed!"
echo ""
echo "📊 Next steps:"
echo "   - Review performance metrics above"
echo "   - Check error rates and response times"
echo "   - Verify traffic distribution patterns"