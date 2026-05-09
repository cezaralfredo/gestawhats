_writeFrontendEnvVars() {
    ENV_JSON="$(jq --compact-output --null-input 'env | with_entries(select(.key | startswith("VITE_")))')"
    ENV_JSON_ESCAPED="$(printf "%s" "${ENV_JSON}" | sed -e 's/[\&/]/\\&/g')"
    sed -i "s/<noscript id=\"env-insertion-point\"><\/noscript>/<script>var ENV=${ENV_JSON_ESCAPED}<\/script>/g" ${PUBLIC_HTML}index.html
}

_writeBackendProxyConfig() {
    if [ -n "$BACKEND_SERVER_NAME" ] && [ -n "$URL_BACKEND" ]; then
        cat >> /etc/nginx/conf.d/default.conf <<EOF

server {
    listen 80;
    server_name ${BACKEND_SERVER_NAME};

    location / {
        set \$backend_url http://${URL_BACKEND};
        proxy_pass \$backend_url;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    fi
}

_writeFrontendEnvVars;
_writeBackendProxyConfig;
