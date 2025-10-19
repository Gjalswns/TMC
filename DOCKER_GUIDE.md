# Docker Deployment Guide

## Prerequisites

1. Docker installed on your system
2. Docker Compose (usually included with Docker Desktop)
3. `.env.local` file with your Supabase configuration

## Environment Variables

Make sure your `.env.local` file contains:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Build and Run Options

### Option 1: Docker Build (Manual)

```bash
# Build the Docker image
npm run docker:build

# Run the container
npm run docker:run
```

### Option 2: Docker Compose (Recommended)

```bash
# Development mode
npm run docker:compose

# Production mode (detached)
npm run docker:compose:prod
```

### Option 3: Manual Docker Commands

```bash
# Build the image
docker build -t tmc-game-platform .

# Run the container
docker run -p 3000:3000 --env-file .env.local tmc-game-platform

# Or with Docker Compose
docker-compose up --build
```

## Accessing the Application

Once the container is running, access the application at:
- **Local**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **Join Game**: http://localhost:3000/join

## Health Check

The application includes a health check endpoint:
- **Health Check**: http://localhost:3000/api/health

## Production Deployment

For production deployment:

1. **Update environment variables** in `.env.local` or use Docker secrets
2. **Use production Docker Compose**:
   ```bash
   docker-compose -f docker-compose.yml up --build -d
   ```
3. **Set up reverse proxy** (nginx, traefik, etc.) for HTTPS
4. **Configure domain** and SSL certificates

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Change port in docker-compose.yml or stop existing service
   docker-compose down
   ```

2. **Environment variables not loaded**:
   ```bash
   # Make sure .env.local exists and has correct format
   # Check Docker logs
   docker logs <container_name>
   ```

3. **Build failures**:
   ```bash
   # Clean Docker cache
   docker system prune -a
   
   # Rebuild without cache
   docker build --no-cache -t tmc-game-platform .
   ```

### Logs

```bash
# View container logs
docker logs <container_name>

# Follow logs in real-time
docker logs -f <container_name>

# With Docker Compose
docker-compose logs -f
```

## Performance Optimization

For production, consider:

1. **Multi-stage builds** (already implemented)
2. **Resource limits** in docker-compose.yml
3. **Health checks** (already implemented)
4. **Log rotation**
5. **Monitoring** (Prometheus, Grafana)

## Security Considerations

1. **Don't include sensitive data** in the image
2. **Use Docker secrets** for production
3. **Run as non-root user** (already implemented)
4. **Keep base images updated**
5. **Scan for vulnerabilities**

```bash
# Scan image for vulnerabilities
docker scout cves tmc-game-platform
```