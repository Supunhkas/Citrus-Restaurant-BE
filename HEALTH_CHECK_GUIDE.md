# Health Check Endpoints Guide

This document describes the health check endpoints implemented in the Citrus Restaurant Backend.

## 🏥 Health Check Endpoints

### 1. **General Health Check**

**Endpoint:** `GET /health`

**Description:** Comprehensive health check that verifies all critical services.

**Response:**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

**Use Case:** Load balancers, monitoring systems, and general health monitoring.

---

### 2. **Liveness Probe**

**Endpoint:** `GET /health/liveness`

**Description:** Simple check to determine if the application is alive and running.

**Response:**

```json
{
  "status": "ok",
  "info": {
    "liveness": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "liveness": {
      "status": "up"
    }
  }
}
```

**Use Case:** Kubernetes liveness probes, container orchestration systems.

---

### 3. **Readiness Probe**

**Endpoint:** `GET /health/readiness`

**Description:** Checks if the application is ready to serve requests (database connectivity).

**Response:**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    }
  }
}
```

**Use Case:** Kubernetes readiness probes, load balancer health checks.

---

## 🔍 Health Check Components

### **Database Health Check**

- **Indicator:** `MongooseHealthIndicator`
- **Check:** Pings MongoDB database
- **Status:**
  - `up` - Database is accessible
  - `down` - Database connection failed

### **Liveness Check**

- **Indicator:** Custom health indicator
- **Check:** Basic application availability
- **Status:** Always returns `up` if the application is running

---

## 🚀 Usage Examples

### **cURL Commands**

```bash
# General health check
curl -X GET http://localhost:3000/health

# Liveness probe
curl -X GET http://localhost:3000/health/liveness

# Readiness probe
curl -X GET http://localhost:3000/health/readiness
```

### **Kubernetes Configuration**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: citrus-restaurant-backend
spec:
  template:
    spec:
      containers:
        - name: app
          image: citrus-restaurant-backend:latest
          livenessProbe:
            httpGet:
              path: /health/liveness
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/readiness
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### **Docker Compose Health Check**

```yaml
version: '3.8'
services:
  backend:
    image: citrus-restaurant-backend:latest
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health/liveness']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### **Load Balancer Configuration**

```nginx
upstream backend {
    server backend1:3000 max_fails=3 fail_timeout=30s;
    server backend2:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;

    location /health {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📊 Monitoring Integration

### **Prometheus Metrics**

The health check endpoints can be integrated with Prometheus for monitoring:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'citrus-restaurant-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/health'
    scrape_interval: 15s
```

### **Grafana Dashboard**

Create alerts based on health check responses:

- Database connectivity issues
- Application availability
- Response time monitoring

---

## 🛠️ Error Responses

### **Database Down**

```json
{
  "status": "error",
  "info": {},
  "error": {
    "database": {
      "status": "down",
      "message": "Unable to connect to database"
    }
  },
  "details": {
    "database": {
      "status": "down",
      "message": "Unable to connect to database"
    }
  }
}
```

### **Application Error**

```json
{
  "status": "error",
  "info": {},
  "error": {
    "liveness": {
      "status": "down",
      "message": "Application is not responding"
    }
  },
  "details": {
    "liveness": {
      "status": "down",
      "message": "Application is not responding"
    }
  }
}
```

---

## 🔧 Configuration

### **Health Check Module**

Located in `src/health/health.module.ts`:

```typescript
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

### **Health Check Controller**

Located in `src/health/health.controller.ts`:

```typescript
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
  ) {}

  // Health check methods...
}
```

---

## 📝 Best Practices

1. **Response Time**: Health checks should respond quickly (< 1 second)
2. **Dependencies**: Only check critical dependencies (database, external services)
3. **Caching**: Avoid caching health check responses
4. **Logging**: Log health check failures for debugging
5. **Security**: Consider authentication for health checks in production
6. **Monitoring**: Set up alerts for health check failures

---

## 🆘 Troubleshooting

### **Common Issues**

1. **Database Connection Failed**
   - Check MongoDB connection string
   - Verify network connectivity
   - Check database server status

2. **Health Check Timeout**
   - Increase timeout values in load balancer/proxy
   - Check application performance
   - Verify resource constraints

3. **False Positives**
   - Adjust health check intervals
   - Review health check logic
   - Check for temporary network issues

### **Debugging Commands**

```bash
# Check if the application is running
curl -v http://localhost:3000/health

# Check database connectivity
curl -v http://localhost:3000/health/readiness

# Check application logs
docker logs <container-name>

# Check MongoDB connection
mongo --eval "db.adminCommand('ping')"
```
