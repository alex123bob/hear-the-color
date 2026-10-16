import styles from '../App.module.css'

interface Props {
  text: string
  isLoading: boolean
}

export default function Caption({ text, isLoading }: Props) {
  // aria-live 让读屏软件在文字变化时自动播报
  return (
    <div className={styles.caption} role="status" aria-live="polite">
      {isLoading ? '正在看…' : text || '点击右上角“开始聆听”'}
    </div>
  )
}
