/**
 * 金山文档 AI 能力服务
 * 提供可复用的 API 调用能力
 */

export interface KdocsSessionRequest {
  filter?: {
    product?: string
    component?: string
    client_type?: string
    entry?: string
    carrier?: string
  }
  scene?: {
    symbol?: string
    type?: number
    id?: string
  }
}

export interface KdocsSessionResponse {
  code: number
  msg: string
  data: {
    session_id: string
    created_at: number
    expire_at: number
    expires_in: number
  }
  more: any
}

export interface KdocsComposeRequest {
  stream?: boolean
  business_info?: {
    billing_info?: {
      intention_code?: string
      product_name?: string
    }
    audit_info?: {
      from?: string
    }
  }
  system_prompt?: {
    id: string // 能力ID（用户输入）
    prompt_type?: string
    attrs?: {
      prompt_replace?: Record<string, any> // 用户输入的 JSON 对象
    }
    switch_thinking?: boolean
  }
  session_info?: {
    session_id: string // 从请求1获取
    message?: {
      role?: string
      content_type?: string
    }
  }
}

export interface KdocsComposeResponse {
  code: number
  msg: string
  data: any
  more: any
}

export interface KdocsConfig {
  baseUrl?: string
  proxyUrl?: string // 代理服务器地址（用于绕过CORS限制，携带Cookie）
  headers?: Record<string, string>
  cookie?: string // Cookie 字符串，用于代理服务器
}

// Cookie 常量（用于第二个请求，从 curl 中提取）
// @ts-ignore - 保留以备后用
const KDOCS_COOKIE_COMPOSE = 'solution_branch=solution-amd-master; wps_endcloud=1; weboffice_device_id=7ad69136bb33425a458ded3a26af6f01; userInNewLayout=true; _ku=1; coa_id=0; weboffice_branch=kdocs-amd-wpp-canvas-20250821; kso-wx-quick-login=68; exp=259200; nexp=129600; swi_acc_redirect_limit=0; csrf=AX4A44EXHfsFWAxF3kHa6js7dYaap43n; env=beta; wpsua=V1BTVUEvMS4wICh3ZWIta2RvY3M6Q2hyb21lXzEwNC4wLjAuMDsgd2luZG93czpXaW5kb3dzIDEwLjA7IFlUbHFmamtEUmxtOHRyUk42RWJEbEE9PTpRMmh5YjIxbElDQXhORE11TUM0d0xqQT0pIENocm9tZS8xNDMuMC4wLjA=; Hm_lvt_cb2fa0997df4ff8e739c666ee2487fd9=1766654289; Hm_lpvt_cb2fa0997df4ff8e739c666ee2487fd9=1766654289; HMACCOUNT=D836AE9BB23EB3CE; cid=0; cv=Jd1iZ_WiZHCI1NZ3qK_7Pd7PJG8gqQgMadG6lNyKTmyC12Jmz5DdeSDRuYvFWcorn1VNksje.skE0C-cmX6G; kso_sid=TKS-f0f4lJngKp9prg2A0poTTKS7fKoAKQKS40ulkQKgx7odTLquco10IpNw_8jlsajzdXRFAzrCA7oqN9SCR7NFIQoU80wyAnor8U65P1zB2xp5KT48O8I-T2KwYWN9s9QBskf9v4FHTSrfWrIIKQ.a1rpxLO6kClKuXufo-MJA2__IvIYB_044yRgf72pb0NE1Czmivz2Dz37oPDInWdBfHl1NcWekY_X6TK_NplK0r; uid=284529338; wps_sid=V02SGBwyKnogGUF5Pcz0Txh5ACfGOGI00accf44f0010f592ba; appcdn=volcengine-kdocs-cache.wpscdn.cn; visitorid=243633234; weboffice_cdn=22; userid=284529338; region=t_release_istio; newbuilt_time=1766662115374'

// Cookie 常量（用于第一个请求）
const KDOCS_COOKIE = 'wps_sid=V02SyjY9SiAG-aKKpKKi599kvPxs0k000aa2a2e70010f98e25; x-kso-app-name=pc-office; x-kso-app-version=12.9.0.20355; x-kso-device-code=JZgx52a2e6yNjHoozndbeykBHsBR; x-kso-device-id=a13b71a7cca9572d7a1fea01c35e14a5; x-kso-device-security-code=eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6InBSM1hiaDRZUGhXUzVIbFZEVi03ZlJvd3JtYmFvNVhJajZqbHU4QVVncmc9IiwieSI6IjE0OGIwNnBISnJTZV9LRmpTN2pKbkNnd3FLekQ2Y0VuNHRLb0g3NU9MWTA9In0=; x-kso-device-signature=1743040008:zpf9O3-g97g43skxZ7Poc9OrJWIK9t-6AjFdCCz0I0nbkjNy0rWTFeFs0i4joVuktjqJC-RAXhHZG82YIJ87qw==; x-kso-device-trademark=RGVsbCBJbmMu; x-kso-device-version=T3B0aVBsZXggNzA1MA==; x-kso-platform-type=windows; x-kso-platform-version=10; wpsua=V1BTVUEvMS4wIChwYy1vZmZpY2U6MTIuOS4wLjIwMzU1OyB3aW5kb3dzOjEwLjAgV09XNjQ7IGExM2I3MWE3Y2NhOTU3MmQ3YTFmZWEwMWMzNWUxNGE1OlJFVlRTMVJQVUMwNFN6QXpURlk0KQ==; kwtid=92c0e0e3; kso_sid=TKS-f0THmEPyKx7erYEV0poTTKI7TroIKEiUdgkK-lIqIQ7unO_HKMfjttn0K7I218pvdma41CczO7ZDN7oqA9S5N9I937SA6RoCPUor0vm77q-7ol44sLzGdNJNSrkwR86pRmSys21FJQr0S7SfphO8dLv2wIbgeFhC1lhv1eueyd8ohZJiIJm5VEeNc0aKCvLj5KuIKcIK.jGeFO-aL6Ld-C4l-RF8X1kqRRGPKqxiZf2Frfd7JpQTZOG8Dtf7jf7zBAj7eFm5Mkmobv1xqTfs8OBpwWZx71Q; cid=674651005; uid=284790309; cv=WOjsBvJS9fwZqPUBpyzqlFqpKCyLtMJ_L7mXdfk1SWF8d55pHryBtuiePc5AU9lHDr9fnQ.AZcy2z5YzY1; _ku=1; plusua=UExVU1VBLzEuMCAod2ViLXBsdXM6Y2hyb21lXzEwNC4wLjUxMTIuMTAyOyBXaW5kb3dzIDEwOldpbmRvd3MgMTA7IE9EVXhPVE0zTnpFMU5ETTJOakF5TWc9PTpBcHBsZVdlYktpdCA1MzcuMzYpIEFwcGxlV2ViS2l0LzUzNy4zNg=='

// 默认配置（使用用户提供的 cookie 和 token）
const defaultConfig: KdocsConfig = {
  baseUrl: 'https://www.kdocs.cn',
  cookie: KDOCS_COOKIE,
  headers: {
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://www.kdocs.cn',
    'priority': 'u=1, i',
    'referer': 'https://www.kdocs.cn/',
    'sec-ch-ua': '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
    'x-client-channel': '0.6.8',
    'x-client-component': 'wpp',
    'x-client-device-id': '6c27cb086735c92708b9728caa5e02b5',
    'x-client-language': 'zh-CN',
    'x-client-product': 'KDOCS',
    'x-client-type': 'kdocs-web',
    'x-client-version': '0.6.8',
    // Token
    'X-Pop-Token': 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdiI6InZrLTFHa0R1ZEJTeHJXN0pNZjQxMGwzNTdhR21yVUt2R0gzbWFMblZHeno0SVZPTV85TFlyNUczak9BMUVRUHpQYXBnc0suMzdnc0M5NVl6WTEiLCJodG0iOiJQT1NUIiwiaHR1IjoiaHR0cHM6Ly9hcGkud3BzLmNuL29mZmljZS92NS9haS9nZW5lcmF0b3Ivc2xpZGVzL2dlbl9zbGlkZSIsImlhdCI6MTc0Mjk4MTM3MX0.LpyRlm8SQnFYpsJRihJHcQck5X1ElSphnBpUhmX1ndFGVxZj9em_NNXbCCleokQyPiI02PxklGG0cRmEkS2DBA'
    // 注意：Cookie 由 Vite 代理服务器在服务端设置，不需要在前端 headers 中设置
  }
}

/**
 * 创建 Session（请求1）
 */
export async function createKdocsSession(
  config?: Partial<KdocsConfig>,
  request?: Partial<KdocsSessionRequest>
): Promise<KdocsSessionResponse> {
  const finalConfig = { ...defaultConfig, ...config }
  const finalRequest: KdocsSessionRequest = {
    filter: {
      product: 'KDOCS',
      component: 'wpp',
      client_type: 'kdocs-web',
      entry: 'default',
      carrier: 'default',
      ...request?.filter
    },
    scene: {
      symbol: 'aigc',
      type: 1,
      id: '1',
      ...request?.scene
    }
  }

  const headers: Record<string, string> = {
    ...finalConfig.headers,
    'x-client-request-id': `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 使用 Vite 代理（同源请求，Cookie 由代理服务器在服务端设置）
  // 浏览器看到的请求是发送到 localhost:5176，与页面同源，不会触发跨域限制
  // Cookie 在 Vite 代理服务器的 proxyReq 事件中设置，不受浏览器限制
  return fetch('/kdocs-api/sessions/create', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(finalRequest)
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`创建 Session 失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`)
    }
    const data = await response.json()
    if (data.code !== 0) {
      throw new Error(`创建 Session 失败: ${data.msg || '未知错误'}`)
    }
    return data
  })
}

/**
 * 调用 AI 能力（请求2）
 */
export async function callKdocsAIGC(
  sessionId: string,
  abilityId: string,
  userInput: Record<string, any>,
  config?: Partial<KdocsConfig>,
  request?: Partial<KdocsComposeRequest>
): Promise<Response> {
  const finalConfig = { ...defaultConfig, ...config }
  const finalRequest: KdocsComposeRequest = {
    stream: true,
    business_info: {
      billing_info: {
        intention_code: 'kdocs_wpp_generate_ppt',
        product_name: 'kdocs-wpp-web',
        ...request?.business_info?.billing_info
      },
      audit_info: {
        from: 'AI_DRIVE_WPP',
        ...request?.business_info?.audit_info
      },
      ...request?.business_info
    },
    system_prompt: {
      id: abilityId,
      prompt_type: 'kpp',
      attrs: {
        prompt_replace: userInput
      },
      switch_thinking: false,
      ...request?.system_prompt
    },
    session_info: {
      session_id: sessionId,
      message: {
        role: 'user',
        content_type: 'text'
      },
      ...request?.session_info
    },
    ...request
  }

  const headers: Record<string, string> = {
    ...finalConfig.headers,
    'x-client-request-id': `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 使用 Vite 代理（同源请求，Cookie 由代理服务器在服务端设置）
  // 浏览器看到的请求是发送到 localhost:5176，与页面同源，不会触发跨域限制
  // Cookie 在 Vite 代理服务器的 proxyReq 事件中设置，不受浏览器限制
  // 流式响应：fetch 返回的 Response 对象支持流式读取
  return fetch('/kdocs-api/aigc/compose', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(finalRequest)
    // 注意：不需要设置任何特殊选项，fetch 默认支持流式响应
  })
}

/**
 * 完整的调用流程（串起两个请求）
 */
export interface KdocsAIGCCallbacks {
  onSessionCreated?: (sessionId: string) => void
  onStreamChunk?: (chunk: string) => void
  onStreamComplete?: (fullContent: string) => void
  onError?: (error: string) => void
}

/**
 * 从金山文档 API 响应中提取内容
 */
// @ts-ignore - 保留以备后用
function extractContentFromKdocsResponse(parsed: any): string {
  // 金山文档 API 响应格式：data.data.message_data.content.delta 或 data.data.message_data.content.full
  // delta 是增量内容，full 是完整内容
  // 优先使用 delta（增量），如果 delta 为空或不存在，则使用 full
  
  const messageContent = parsed?.data?.message_data?.content
  if (messageContent) {
    // 优先使用 delta（增量内容）
    if (messageContent.delta !== undefined && messageContent.delta !== null && messageContent.delta !== '') {
      return String(messageContent.delta)
    }
    // 如果 delta 为空，使用 full（完整内容）
    // 注意：full 是累积的完整内容，不是增量，所以需要特殊处理
    if (messageContent.full !== undefined && messageContent.full !== null && messageContent.full !== '') {
      return String(messageContent.full)
    }
  }
  
  // 兼容其他可能的格式
  if (parsed?.choices?.[0]?.delta?.content) {
    return parsed.choices[0].delta.content
  }
  if (parsed?.choices?.[0]?.message?.content) {
    return parsed.choices[0].message.content
  }
  if (parsed?.content) {
    return parsed.content
  }
  if (parsed?.data?.content) {
    return parsed.data.content
  }
  if (parsed?.text) {
    return parsed.text
  }
  if (parsed?.data?.text) {
    return parsed.data.text
  }
  if (parsed?.message) {
    return parsed.message
  }
  
  return ''
}

export async function callKdocsAIGCFull(
  abilityId: string,
  userInput: Record<string, any>,
  config?: Partial<KdocsConfig>,
  callbacks?: KdocsAIGCCallbacks
): Promise<string> {
  try {
    // 步骤1：创建 Session
    callbacks?.onSessionCreated?.('创建 Session 中...')
    const sessionResponse = await createKdocsSession(config)
    const sessionId = sessionResponse.data.session_id
    callbacks?.onSessionCreated?.(sessionId)

    // 步骤2：调用 AI 能力（流式）
    const response = await callKdocsAIGC(sessionId, abilityId, userInput, config)

    // 调试：检查响应状态和头信息
    console.log('[Stream] Response status:', response.status)
    console.log('[Stream] Response ok:', response.ok)
    console.log('[Stream] Response headers:', Object.fromEntries(response.headers.entries()))
    console.log('[Stream] Response body:', response.body)
    
    // 检查响应是否成功
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`调用 AI 能力失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`)
    }
    
    // 检查响应体是否存在
    if (!response.body) {
      throw new Error('响应体为空，无法读取流式数据')
    }

    // 处理流式响应，只提取 full 字段并拼接
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''
    let lastFullLength = 0 // 记录上次 full 的长度，用于提取增量

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (!value) continue

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        // 处理 SSE 格式：event:message 和 data:{...}
        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue

          // 处理 data: 行
          if (trimmedLine.startsWith('data:')) {
            const dataContent = trimmedLine.slice(5).trim()
            
            // 解析 JSON
            if (dataContent && (dataContent.startsWith('{') || dataContent.startsWith('['))) {
              try {
                const parsed = JSON.parse(dataContent)
                const full = parsed?.data?.message_data?.content?.full
                
                // 只提取 full 字段
                if (full !== undefined && full !== null && full !== '') {
                  const fullText = String(full)
                  
                  // 如果 full 比上次的长度长，说明有新内容
                  if (fullText.length > lastFullLength) {
                    // 提取增量部分
                    const newContent = fullText.slice(lastFullLength)
                    fullContent += newContent
                    lastFullLength = fullText.length
                    
                    // 实时回调增量内容
                    callbacks?.onStreamChunk?.(newContent)
                  } else if (fullText.length > 0 && fullContent.length === 0) {
                    // 第一次收到 full，直接使用
                    fullContent = fullText
                    lastFullLength = fullText.length
                    callbacks?.onStreamChunk?.(fullText)
                  }
                }
              } catch (e) {
                console.warn('[Stream] Failed to parse data:', dataContent.substring(0, 100), e)
              }
            }
            continue
          }
        }
      }

      // 处理剩余的 buffer
      if (buffer.trim()) {
        const trimmedBuffer = buffer.trim()
        if (trimmedBuffer.startsWith('data:')) {
          const dataContent = trimmedBuffer.slice(5).trim()
          if (dataContent && (dataContent.startsWith('{') || dataContent.startsWith('['))) {
            try {
              const parsed = JSON.parse(dataContent)
              const full = parsed?.data?.message_data?.content?.full
              if (full !== undefined && full !== null && full !== '') {
                const fullText = String(full)
                if (fullText.length > lastFullLength) {
                  const newContent = fullText.slice(lastFullLength)
                  fullContent += newContent
                  callbacks?.onStreamChunk?.(newContent)
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      callbacks?.onStreamComplete?.(fullContent)
      return fullContent
    } finally {
      reader.releaseLock()
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    callbacks?.onError?.(errorMsg)
    throw error
  }
}

