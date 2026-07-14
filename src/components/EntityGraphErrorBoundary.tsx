import { Component, type ReactNode } from 'react'

type EntityGraphErrorBoundaryProps = {
  children: ReactNode
}

type EntityGraphErrorBoundaryState = {
  failed: boolean
}

export class EntityGraphErrorBoundary extends Component<
  EntityGraphErrorBoundaryProps,
  EntityGraphErrorBoundaryState
> {
  state: EntityGraphErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): EntityGraphErrorBoundaryState {
    return { failed: true }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <p role="alert" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          实体图谱暂时无法显示，请切回笔记图谱。
        </p>
      )
    }

    return this.props.children
  }
}