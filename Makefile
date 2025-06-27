VERSION ?= v1
CLUSTER_NAME ?=otel

cluster:
	kind create cluster --name=$(CLUSTER_NAME) --config ./kind/multi-node.yaml
	kubectl create namespace opentelemetry

delete-cluster:
	kind delete cluster --name=$(CLUSTER_NAME)

instrumentation:
	kubectl apply -f ./instrumentations/instrumentation.yaml

build:
	docker build -f ./services/todo-go/Dockerfile -t todo-go:$(VERSION) ./services/todo-go
	docker build -f ./services/todo-java/Dockerfile -t todo-java:$(VERSION) ./services/todo-java
	docker build -f ./services/frontend/Dockerfile -t todo-frontend:$(VERSION) ./services/frontend

kind-load: build
	kind load docker-image --name $(CLUSTER_NAME) todo-go:$(VERSION)
	kind load docker-image --name $(CLUSTER_NAME) todo-java:$(VERSION)
	kind load docker-image --name $(CLUSTER_NAME) todo-frontend:$(VERSION)

deploy-k8s: kind-load 
	kubectl apply -f ./services/todo-go/manifests/
	kubectl apply -f ./services/todo-java/manifests/
	kubectl apply -f ./services/frontend/manifests/

deploy-postgres:
	helm install pg oci://registry-1.docker.io/bitnamicharts/postgresql \
  		--set global.postgresql.auth.postgresPassword=password \
  		--set global.postgresql.auth.database=todo

deploy-mysql:
	helm install my-mysql bitnami/mysql \
		--set auth.rootPassword=mysecretPassword \
		--set auth.database=todo \
		--set auth.username=todo \
		--set auth.password=mysecretPassword

deploy-jaeger:
	helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
	helm upgrade --install jaeger jaegertracing/jaeger --values ./jaeger/values.yaml

deploy-prometheus:
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
	helm upgrade --install prometheus prometheus-community/prometheus --values ./prometheus/values.yaml

deploy-opensearch:
	helm repo add opensearch https://opensearch-project.github.io/helm-charts
	helm upgrade --install opensearch opensearch/opensearch -f ./opensearch/values.yaml
	helm upgrade --install opensearch-dashboards opensearch/opensearch-dashboards -f ./opensearch/dashboard-values.yaml

deploy-perses-operator:
	@echo "Installing Perses Operator CRDs and deploying the operator..."
	kustomize build 'github.com/perses/perses-operator/config/default?ref=a324bdf0142c98271cfa5a17e91ae4eaf461bbe8' | kubectl apply -f -
	kubectl apply -f ./perses/perses.yaml

deploy-cert-manager:
	helm repo add jetstack https://charts.jetstack.io --force-update
	helm upgrade --install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set crds.enabled=true

deploy-promtheus-operator-crds:
	kubectl apply --server-side -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.80.1/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
	kubectl apply --server-side -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.80.1/example/prometheus-operator-crd/monitoring.coreos.com_podmonitors.yaml

deploy-opentelemetry-operator: deploy-cert-manager deploy-promtheus-operator-crds
	helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
	helm upgrade --install opentelemetry-operator open-telemetry/opentelemetry-operator --set manager.extraArgs="{--enable-go-instrumentation}" --set "manager.collectorImage.repository=otel/opentelemetry-collector-k8s" --namespace opentelemetry --create-namespace

deploy-dash0-secret:
ifndef DASH0_AUTH_TOKEN
	$(error DASH0_AUTH_TOKEN is not set)
endif
	kubectl create secret generic dash0-secrets --from-literal=dash0-authorization-token=${DASH0_AUTH_TOKEN} --namespace opentelemetry

deploy-opentelemetry-collector: deploy-dash0-secret deploy-promtheus-operator-crds
	helm upgrade --install otel-collector-daemonset open-telemetry/opentelemetry-collector --namespace opentelemetry  -f ./collector/daemonset-values.yaml
	helm upgrade --install otel-collector-deployment open-telemetry/opentelemetry-collector --namespace opentelemetry  -f ./collector/deployment-values.yaml


deploy-all: deploy-opentelemetry-operator deploy-perses-operator deploy-mysql deploy-postgres deploy-prometheus deploy-jaeger deploy-opensearch deploy-opentelemetry-collector