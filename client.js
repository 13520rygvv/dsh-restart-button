window.__ModuleLoader__.load({
  id: '@local/dsh-restart-button',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace and Settings row identity of this package. */
    const NS = 'dsh-restart-button'
    /** Exact Fetch route served by the Host twin of this package. */
    const ROUTE = '/api/dsh-restart'
    /** Row and card classes; prefixed so the injected sheet cannot collide with the host. */
    const CSS = `
      .dsrb-row { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0; border-bottom:.5px solid var(--dsw-alias-border-l2); }
      .dsrb-copy { min-width:0; }
      .dsrb-title { font-size:14px; line-height:20px; color:var(--dsw-alias-label-primary); }
      .dsrb-description { margin-top:4px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); }
      .dsrb-warning { margin-top:6px; font-size:12px; line-height:18px; color:var(--dsw-alias-state-warn-primary); overflow-wrap:anywhere; }
      .dsrb-error { margin-top:6px; font-size:12px; line-height:18px; color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; }
      .dsrb-actions { flex:none; display:flex; align-items:center; gap:8px; }
      .dsrb-button { height:32px; padding:0 14px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2); background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; line-height:20px; cursor:pointer; }
      .dsrb-button:hover:enabled { background:var(--dsw-alias-interactive-bg-hover); }
      .dsrb-button:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
      .dsrb-button:disabled { opacity:.6; cursor:default; }
      .dsrb-primary { border-color:transparent; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground); }
      .dsrb-primary:hover:enabled { background:var(--dsw-alias-button-primary-hover); }
      .dsrb-overlay { position:fixed; top:76px; left:50%; transform:translateX(-50%); z-index:60; width:min(440px,calc(100vw - 32px)); pointer-events:auto; }
      .dsrb-card { display:flex; flex-direction:column; gap:10px; padding:16px; border-radius:12px; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-overlay); }
      .dsrb-card-title { font-size:14px; line-height:20px; color:var(--dsw-alias-label-primary); }
      .dsrb-card-text { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
      .dsrb-card-actions { display:flex; justify-content:flex-end; gap:8px; }
    `

    /** Simplified Chinese copy. */
    const zh = {
      'title': '重启 DeepSeek Harness',
      'description': '重新启动应用，让修改过的配置和插件生效。',
      'button': '重启',
      'starting': '正在重启…',
      'confirm.active': '仍有进行中的任务，重启会立即中断它们。确定继续？',
      'confirm.scheduled': '有挂起的定时任务，应用关闭期间不会运行。确定继续？',
      'confirm.both': '仍有进行中的任务，且有挂起的定时任务；重启会中断任务，关闭期间定时任务也不会运行。确定继续？',
      'confirm.continue': '仍要重启',
      'confirm.title': '重启 DeepSeek Harness',
      'cancel': '取消',
      'close': '关闭',
      'failed': '重启失败：{message}',
      'unsupported': '当前环境不支持一键重启，仅 Windows 桌面版可用。',
      'stalled': '重启没有完成，请重试或手动重启应用。',
      'shortcut.label': '重启 DeepSeek Harness',
      'menu.restart': '重启',
    }

    /** English copy. */
    const en = {
      'title': 'Restart DeepSeek Harness',
      'description': 'Restarts the app so changed configuration and plugins take effect.',
      'button': 'Restart',
      'starting': 'Restarting…',
      'confirm.active': 'Tasks are still running and will be interrupted. Continue?',
      'confirm.scheduled': 'Scheduled reminders will not run while the app is closed. Continue?',
      'confirm.both': 'Tasks are still running, and scheduled reminders will not run while the app is closed. Continue?',
      'confirm.continue': 'Restart anyway',
      'confirm.title': 'Restart DeepSeek Harness',
      'cancel': 'Cancel',
      'close': 'Close',
      'failed': 'Restart failed: {message}',
      'unsupported': 'One-click restart is only available in the Windows desktop app.',
      'stalled': 'The restart did not complete. Try again, or restart the app manually.',
      'shortcut.label': 'Restart DeepSeek Harness',
      'menu.restart': 'Restart',
    }

    /**
     * Resolve copy without the slot's `t`, which keeps every surface usable when
     * a composition does not bind this package's dictionary.
     * @param key - dictionary key.
     * @param params - placeholder values.
     * @returns the localized sentence.
     */
    function fallbackText(key, params) {
      const template = zh[key] ?? en[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** Dictionary binding installed by `apply`; the locale service keeps it live. */
    let translate = null

    /**
     * Localized copy for surfaces that own no `t` prop.
     * @param key - dictionary key.
     * @param params - placeholder values.
     * @returns the localized sentence.
     */
    function copy(key, params) {
      return translate === null ? fallbackText(key, params) : translate(key, params)
    }

    /**
     * Ask the Host to restart the application.
     * @param force - true after the user accepted interrupting running work.
     * @returns the Host answer: `restarting`, `needs-confirmation`, or `unsupported`.
     */
    async function requestRestart(force) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restart', force: force === true }),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
      }
      if (payload === null || payload.ok !== true) {
        throw new Error(payload !== null && typeof payload.error === 'string' ? payload.error : 'restart request was rejected')
      }
      return payload
    }

    /**
     * An unexpected unanswered restart is reported instead of leaving the row
     * waiting forever; the Host answers it in well under a second.
     */
    const STALL_MS = 12000

    /** One overlay decision at a time, shared by the shortcut and its confirmation card. */
    const decision = {
      /** Current card state: null, a confirmation, a notice, or a failure. */
      state: null,
      listeners: new Set(),
      set(next) {
        decision.state = next
        for (const listener of [...decision.listeners]) listener()
      },
    }

    /**
     * Subscribe one component to the overlay decision state.
     * @returns the current card state.
     */
    function useDecision() {
      const [value, setValue] = React.useState(decision.state)
      React.useEffect(() => {
        const listener = () => setValue(decision.state)
        decision.listeners.add(listener)
        listener()
        return () => {
          decision.listeners.delete(listener)
        }
      }, [])
      return value
    }

    /** Guards re-entrant shortcut presses while a request is in flight. */
    let inFlight = false

    /**
     * Run one restart request outside the Settings row, such as from the shortcut.
     * @param force - true after the user accepted interrupting running work.
     * @returns nothing; the outcome is published through the overlay state.
     */
    async function triggerRestart(force) {
      if (inFlight) return
      inFlight = true
      try {
        const value = await requestRestart(force === true)
        if (value.status === 'needs-confirmation') {
          decision.set({ activeTasks: value.activeTasks, scheduledTasks: value.scheduledTasks })
        } else if (value.status === 'unsupported') {
          decision.set({ notice: copy('unsupported') })
        }
      } catch (error) {
        decision.set({ notice: copy('failed', { message: error instanceof Error ? error.message : String(error) }) })
      } finally {
        inFlight = false
      }
    }

    /**
     * General Settings row that restarts the Desktop application. The Host
     * decides whether a confirmation is needed, so the row stays a single
     * button until something is actually interruptible.
     * @param props - localized copy (`t`).
     * @returns the row with its restart control.
     */
    function RestartRow(props) {
      const tr = typeof props.t === 'function' ? props.t : fallbackText
      const [phase, setPhase] = React.useState('idle')
      const [pending, setPending] = React.useState(null)
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        if (phase !== 'starting') return undefined
        const timer = setTimeout(() => {
          setNotice(tr('stalled'))
          setPhase('idle')
        }, STALL_MS)
        return () => clearTimeout(timer)
      }, [phase, tr])

      const run = (force) => {
        setNotice(null)
        setPhase('starting')
        Promise.resolve()
          .then(() => requestRestart(force))
          .then((value) => {
            if (value.status === 'needs-confirmation') {
              setPending(value)
              setPhase('confirm')
              return
            }
            setPending(null)
            if (value.status === 'unsupported') {
              setNotice(tr('unsupported'))
              setPhase('idle')
            }
          })
          .catch((failure) => {
            setNotice(tr('failed', { message: failure instanceof Error ? failure.message : String(failure) }))
            setPhase('idle')
          })
      }

      const warning = pending === null
        ? null
        : pending.activeTasks && pending.scheduledTasks
          ? tr('confirm.both')
          : pending.activeTasks
            ? tr('confirm.active')
            : tr('confirm.scheduled')

      const controls = phase === 'confirm'
        ? [
            h('button', {
              key: 'cancel',
              type: 'button',
              className: 'dsrb-button',
              onClick: () => {
                setPending(null)
                setPhase('idle')
              },
            }, tr('cancel')),
            h('button', {
              key: 'force',
              type: 'button',
              className: 'dsrb-button dsrb-primary',
              onClick: () => {
                setPending(null)
                run(true)
              },
            }, tr('confirm.continue')),
          ]
        : h('button', {
            type: 'button',
            className: 'dsrb-button',
            disabled: phase === 'starting',
            onClick: () => run(false),
          }, phase === 'starting' ? tr('starting') : tr('button'))

      return h('div', { className: 'dsrb-row' }, [
        h('div', { key: 'copy', className: 'dsrb-copy' }, [
          h('div', { key: 'title', className: 'dsrb-title' }, tr('title')),
          h('div', { key: 'description', className: 'dsrb-description' }, tr('description')),
          warning === null ? null : h('div', {
            key: 'warning',
            className: 'dsrb-warning',
            role: 'alert',
          }, warning),
          notice === null ? null : h('div', {
            key: 'notice',
            className: 'dsrb-error',
            role: 'alert',
          }, notice),
        ]),
        h('div', { key: 'actions', className: 'dsrb-actions' }, controls),
      ])
    }

    /**
     * Frame-wide card used when the keyboard shortcut needs a decision.
     * @param props - localized copy (`t`).
     * @returns the card, or nothing while no decision is pending.
     */
    function RestartCard(props) {
      const tr = typeof props.t === 'function' ? props.t : fallbackText
      const state = useDecision()

      React.useEffect(() => {
        if (state === null) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') decision.set(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [state])

      if (state === null) return null
      const text = state.notice !== undefined
        ? state.notice
        : state.activeTasks && state.scheduledTasks
          ? tr('confirm.both')
          : state.activeTasks
            ? tr('confirm.active')
            : tr('confirm.scheduled')
      const actions = state.notice !== undefined
        ? [h('button', {
            key: 'close',
            type: 'button',
            className: 'dsrb-button dsrb-primary',
            onClick: () => decision.set(null),
          }, tr('close'))]
        : [
            h('button', {
              key: 'cancel',
              type: 'button',
              className: 'dsrb-button',
              autoFocus: true,
              onClick: () => decision.set(null),
            }, tr('cancel')),
            h('button', {
              key: 'force',
              type: 'button',
              className: 'dsrb-button dsrb-primary',
              onClick: () => {
                decision.set(null)
                void triggerRestart(true)
              },
            }, tr('confirm.continue')),
          ]
      return h('div', { className: 'dsrb-overlay' },
        h('div', {
          className: 'dsrb-card',
          role: 'alertdialog',
          'aria-label': tr('confirm.title'),
        }, [
          h('div', { key: 'title', className: 'dsrb-card-title' }, tr('confirm.title')),
          h('p', { key: 'text', className: 'dsrb-card-text' }, text),
          h('div', { key: 'actions', className: 'dsrb-card-actions' }, actions),
        ]))
    }

    /** Restart glyph for the account-menu row; the menu item inherits its color. */
    const RESTART_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M13 8a5 5 0 1 1-1.46-3.54" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13.2 2.6v3.4h-3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

    /**
     * Replace the first text node matching `pattern`.
     * @param root - cloned menu item.
     * @param pattern - label matcher.
     * @param next - replacement label.
     */
    function replaceLabel(root, pattern, next) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node !== null) {
        if (pattern.test(node.nodeValue ?? '')) {
          node.nodeValue = next
          return
        }
        node = walker.nextNode()
      }
      root.append(document.createTextNode(next))
    }

    /**
     * Add a Restart row above "Sign out" in the account popover.
     *
     * The shipped account menu renders a fixed item list and exposes no slot
     * for extra entries, so this clones its sign-out row — keeping the native
     * classes, icon slot, and hover state — and swaps the label, icon, and
     * click behavior. A DSH update that changes that menu makes this row
     * disappear; nothing else breaks.
     * @returns nothing; every open account menu receives the row.
     */
    function injectAccountRestart() {
      for (const menu of document.querySelectorAll('[role="menu"]')) {
        if (menu.querySelector('[data-dsh-restart-menu]') !== null) continue
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
        const signOut = items.find((node) => /退出登录|sign out/i.test(node.textContent ?? ''))
        if (signOut === undefined || signOut.parentElement === null) continue
        const item = signOut.cloneNode(true)
        item.removeAttribute('id')
        item.removeAttribute('disabled')
        item.removeAttribute('aria-disabled')
        item.removeAttribute('aria-expanded')
        item.setAttribute('data-dsh-restart-menu', '1')
        const label = copy('menu.restart')
        item.setAttribute('aria-label', label)
        replaceLabel(item, /退出登录|sign out/i, label)
        const icon = item.querySelector('svg')
        if (icon !== null) icon.outerHTML = RESTART_ICON
        item.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          void triggerRestart(false)
        })
        signOut.parentElement.insertBefore(item, signOut)
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        translate = ctx.locale.bind(NS)

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/dsh-restart-button'
          tag.dataset.pluginCss = '@local/dsh-restart-button/settings-row.css'
          tag.textContent = CSS
          document.head.append(tag)
          return () => {
            tag.remove()
          }
        }, 'dsh-restart-button: styles')

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-restart-button: dictionaries')

        ctx.effect(() => {
          let scheduled = false
          const schedule = () => {
            if (scheduled) return
            scheduled = true
            requestAnimationFrame(() => {
              scheduled = false
              injectAccountRestart()
            })
          }
          const observer = new MutationObserver(schedule)
          observer.observe(document.body, { childList: true, subtree: true })
          schedule()
          return () => {
            observer.disconnect()
            for (const node of document.querySelectorAll('[data-dsh-restart-menu]')) node.remove()
          }
        }, 'dsh-restart-button: account menu entry')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'restart-application',
          order: 97,
          locale: NS,
        }, RestartRow))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'restart-decision',
          order: 900,
          locale: NS,
        }, RestartCard))

        // The shortcut service is optional, and it may activate after this
        // plugin: register through inject so the command exists either way.
        // Defaults stay desktop-only because the Web profiles already bind
        // primary+alt+R to "refresh page".
        const register = (shortcuts) => {
          try {
            ctx.effect(() => shortcuts.register({
              id: 'dsh-restart-button.restart',
              label: () => copy('shortcut.label'),
              aliases: ['restart', 'reboot'],
              defaults: {
                'desktop:windows': { code: 'KeyR', modifiers: ['primary', 'alt'] },
                'desktop:macos': { code: 'KeyR', modifiers: ['primary', 'alt'] },
                'desktop:linux': { code: 'KeyR', modifiers: ['primary', 'alt'] },
              },
              regions: ['page', 'editable', 'terminal'],
              modals: ['settings'],
              resolve: () => ({
                status: 'handled',
                run: () => {
                  void triggerRestart(false)
                },
              }),
            }), 'dsh-restart-button: restart shortcut')
          } catch (error) {
            console.warn('[dsh-restart-button] shortcut registration failed', error)
          }
        }
        const shortcuts = ctx.get('shortcuts')
        if (shortcuts === undefined) {
          ctx.inject(['shortcuts'], (scope) => register(scope.shortcuts))
          return
        }
        register(shortcuts)
      },
    }
  },
})
