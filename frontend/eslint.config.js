import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { react },
    rules: {
      // ให้ eslint รู้ว่า component ที่ใช้ใน JSX (<Foo />) ถือว่าถูกใช้แล้ว
      // ไม่งั้น no-unused-vars จะฟ้อง import ของ component ทุกตัวเป็น false positive
      'react/jsx-uses-vars': 'error',
      // ยกเว้นเฉพาะที่ขึ้นต้นด้วย _ (กรณีที่จำนวน argument ถูกบังคับโดยโครงสร้าง)
      // ไม่ยกเว้นตัวพิมพ์ใหญ่ทั้งหมดแบบ template เดิม ไม่งั้น constant ที่ไม่ได้ใช้จะหลุดรอด
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
