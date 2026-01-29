import { ref, watch, Ref } from 'vue'

export function useLocalStorage() {
    const saveToStorage = (key: string, value: string) => {
        try {
            localStorage.setItem(key, value)
        } catch (error) {
            console.warn('Failed to save to localStorage:', error)
        }
    }

    const loadFromStorage = (key: string): string | null => {
        try {
            return localStorage.getItem(key)
        } catch (error) {
            console.warn('Failed to load from localStorage:', error)
            return null
        }
    }

    const removeFromStorage = (key: string) => {
        try {
            localStorage.removeItem(key)
        } catch (error) {
            console.warn('Failed to remove from localStorage:', error)
        }
    }

    return {
        saveToStorage,
        loadFromStorage,
        removeFromStorage
    }
}

/**
 * 创建一个响应式的localStorage存储
 * @param key localStorage的键名
 * @param defaultValue 默认值
 * @returns 响应式引用
 */
export function useStorageRef<T>(key: string, defaultValue: T): Ref<T> {
    // 从localStorage加载初始值
    const loadInitialValue = (): T => {
        try {
            const stored = localStorage.getItem(key)
            if (stored !== null) {
                return JSON.parse(stored) as T
            }
        } catch (error) {
            console.warn(`Failed to load ${key} from localStorage:`, error)
        }
        return defaultValue
    }

    // 创建响应式引用
    const data = ref(loadInitialValue()) as Ref<T>

    // 监听变化并自动保存
    watch(
        data,
        (newValue) => {
            try {
                localStorage.setItem(key, JSON.stringify(newValue))
            } catch (error) {
                console.warn(`Failed to save ${key} to localStorage:`, error)
            }
        },
        { deep: true }
    )

    return data
}

