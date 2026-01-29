import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5176,
    proxy: {
      // 金山文档 API 代理 - 创建 Session
      '/kdocs-api/sessions/create': {
        target: 'https://www.kdocs.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kdocs-api\/sessions\/create/, '/office/v5/ai/sessions/create'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Cookie', 'solution_branch=solution-amd-master; wps_endcloud=1; weboffice_device_id=7ad69136bb33425a458ded3a26af6f01; userInNewLayout=true; _ku=1; coa_id=0; weboffice_branch=kdocs-amd-wpp-canvas-20250821; kso-wx-quick-login=68; Hm_lvt_cb2fa0997df4ff8e739c666ee2487fd9=1766654289; cid=0; uid=284529338; wps_sid=V02SGBwyKnogGUF5Pcz0Txh5ACfGOGI00accf44f0010f592ba; appcdn=volcengine-kdocs-cache.wpscdn.cn; weboffice_cdn=22; env=beta; wpsua=V1BTVUEvMS4wICh3ZWIta2RvY3M6Q2hyb21lXzE0My4wLjAuMDsgd2luZG93czpXaW5kb3dzIDEwLjA7IDZ3d3BKVWw2UmlDaG5uQ1V2SndnOUE9PTpRMmh5YjIxbElDQXhORE11TUM0d0xqQT0pIENocm9tZS8xNDMuMC4wLjA=; cv=2TLzrTkmhVZKXtr304r4nq56_zrh2gpptvBxnk-kYnIDep5C319mJndBkM3zdrh9xpv0BScy.el6vj7cmX6G; exp=259200; kso_sid=TKS-f0f4lJngKp7Xy14A0poTTKS7fKoAKQKS40ulkQKgx7odTLquco10IpNw_8jlsajzdXRFAzrCA7oqN9SCR7NFIQoU80wyAnor8U65P1zB2xp5KT48O8I-T2KwYWN9s9QBskf9v4FHTSrfWrIIKQ.h6HyGB9yngh-d7TkIM4ryVYPa0gAPlgaE5NDuUvyR58-hyIm3cxmfaDS6bhPP4E61HFM6Q4ojehJLSF0nNHhLw; nexp=129600; csrf=Ee87W5xkskXpmYCsJCPkk8cC47aJKhya; userid=284529338; swi_acc_redirect_limit=0; visitorid=632906116; region=t_release_istio')
          })
        }
      },
      // 金山文档 API 代理 - AI 能力调用（流式响应）
      '/kdocs-api/aigc/compose': {
        target: 'https://www.kdocs.cn',
        changeOrigin: true,
        rewrite: (path) => {
          const newPath = path.replace(/^\/kdocs-api\/aigc\/compose/, '/office/v5/ai/aigc/completions/compose')
          console.log('[Proxy] Rewrite path:', path, '->', newPath)
          return newPath
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Proxy] Request URL:', proxyReq.path)
            // 使用第二个请求专用的 Cookie（从 curl 中提取）
            proxyReq.setHeader('Cookie', 'solution_branch=solution-amd-master; wps_endcloud=1; weboffice_device_id=7ad69136bb33425a458ded3a26af6f01; userInNewLayout=true; _ku=1; coa_id=0; weboffice_branch=kdocs-amd-wpp-canvas-20250821; kso-wx-quick-login=68; Hm_lvt_cb2fa0997df4ff8e739c666ee2487fd9=1766654289; cid=0; uid=284529338; wps_sid=V02SGBwyKnogGUF5Pcz0Txh5ACfGOGI00accf44f0010f592ba; appcdn=volcengine-kdocs-cache.wpscdn.cn; weboffice_cdn=22; env=beta; wpsua=V1BTVUEvMS4wICh3ZWIta2RvY3M6Q2hyb21lXzE0My4wLjAuMDsgd2luZG93czpXaW5kb3dzIDEwLjA7IDZ3d3BKVWw2UmlDaG5uQ1V2SndnOUE9PTpRMmh5YjIxbElDQXhORE11TUM0d0xqQT0pIENocm9tZS8xNDMuMC4wLjA=; cv=2TLzrTkmhVZKXtr304r4nq56_zrh2gpptvBxnk-kYnIDep5C319mJndBkM3zdrh9xpv0BScy.el6vj7cmX6G; exp=259200; kso_sid=TKS-f0f4lJngKp7Xy14A0poTTKS7fKoAKQKS40ulkQKgx7odTLquco10IpNw_8jlsajzdXRFAzrCA7oqN9SCR7NFIQoU80wyAnor8U65P1zB2xp5KT48O8I-T2KwYWN9s9QBskf9v4FHTSrfWrIIKQ.h6HyGB9yngh-d7TkIM4ryVYPa0gAPlgaE5NDuUvyR58-hyIm3cxmfaDS6bhPP4E61HFM6Q4ojehJLSF0nNHhLw; nexp=129600; csrf=Ee87W5xkskXpmYCsJCPkk8cC47aJKhya; userid=284529338; swi_acc_redirect_limit=0; visitorid=632906116; region=t_release_istio')
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Proxy] Response status:', proxyRes.statusCode)
            console.log('[Proxy] Response headers:', JSON.stringify(proxyRes.headers, null, 2))
            
            // 确保流式响应不被缓冲
            // 移除可能导致缓冲的 headers
            if (proxyRes.headers['content-encoding']) {
              delete proxyRes.headers['content-encoding']
            }
            
            // 设置流式响应相关的 headers
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲（如果使用）
            
            // 确保响应立即开始传输
            if (!res.headersSent && proxyRes.statusCode) {
              res.writeHead(proxyRes.statusCode, proxyRes.headers)
            }
          })
          proxy.on('error', (err, req, res) => {
            console.error('[Proxy] Error:', err)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Proxy Error: ' + err.message)
            }
          })
        }
      },
      // HTML模板代理 - 解决CORS问题
      '/html-template-proxy': {
        target: 'https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com',
        changeOrigin: true,
        rewrite: (path) => {
          // 将 /html-template-proxy/html-slides/... 转换为 /html-slides/...
          return path.replace(/^\/html-template-proxy/, '')
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Template Proxy] Request URL:', proxyReq.path)
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Template Proxy] Response status:', proxyRes.statusCode)
            // 添加CORS头
            if (proxyRes.headers) {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*'
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type'
            }
          })
        }
      }
    }
  }
})

