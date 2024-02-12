import { preventDefault, track, useContainer, useEditor, useTranslation } from '@tldraw/tldraw'
import {
	ChangeEvent,
	ClipboardEvent,
	KeyboardEvent,
	RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'

// todo:
// - not cleaning up
const CHAT_MESSAGE_TIMEOUT_CLOSING = 2000
const CHAT_MESSAGE_TIMEOUT_CHATTING = 5000

export const CursorChatBubble = track(function CursorChatBubble() {
	const editor = useEditor()
	const container = useContainer()
	const { isChatting, chatMessage } = editor.getInstanceState()

	const rTimeout = useRef<any>(-1)
	const [value, setValue] = useState('')

	useEffect(() => {
		const closingUp = !isChatting && chatMessage
		if (closingUp || isChatting) {
			const duration = isChatting ? CHAT_MESSAGE_TIMEOUT_CHATTING : CHAT_MESSAGE_TIMEOUT_CLOSING
			rTimeout.current = setTimeout(() => {
				editor.updateInstanceState({ chatMessage: '', isChatting: false })
				setValue('')
				container.focus()
			}, duration)
		}

		return () => {
			clearTimeout(rTimeout.current)
		}
	}, [container, editor, chatMessage, isChatting])

	if (isChatting)
		return <CursorChatInput value={value} setValue={setValue} chatMessage={chatMessage} />

	return chatMessage.trim() ? <NotEditingChatMessage chatMessage={chatMessage} /> : null
})

function usePositionBubble(ref: RefObject<HTMLInputElement>) {
	const editor = useEditor()

	useLayoutEffect(() => {
		const elm = ref.current
		if (!elm) return

		const { x, y } = editor.inputs.currentScreenPoint
		ref.current?.style.setProperty('transform', `translate(${x}px, ${y}px)`)

		// Positioning the chat bubble
		function positionChatBubble(e: PointerEvent) {
			ref.current?.style.setProperty('transform', `translate(${e.clientX}px, ${e.clientY}px)`)
		}

		window.addEventListener('pointermove', positionChatBubble)

		return () => {
			window.removeEventListener('pointermove', positionChatBubble)
		}
	}, [ref, editor])
}

const NotEditingChatMessage = ({ chatMessage }: { chatMessage: string }) => {
	const editor = useEditor()
	const ref = useRef<HTMLInputElement>(null)

	usePositionBubble(ref)

	return (
		<div
			ref={ref}
			className="tl-cursor-chat tl-cursor-chat__bubble"
			style={{ backgroundColor: editor.user.getColor() }}
		>
			{chatMessage}
		</div>
	)
}

const CursorChatInput = track(function CursorChatInput({
	chatMessage,
	value,
	setValue,
}: {
	chatMessage: string
	value: string
	setValue: (value: string) => void
}) {
	const editor = useEditor()
	const msg = useTranslation()
	const container = useContainer()

	const ref = useRef<HTMLInputElement>(null)
	const placeholder = chatMessage || msg('cursor-chat.type-to-chat')

	usePositionBubble(ref)

	useLayoutEffect(() => {
		const elm = ref.current
		if (!elm) return

		const textMeasurement = editor.textMeasure.measureText(value || placeholder, {
			fontFamily: 'var(--font-body)',
			fontSize: 12,
			fontWeight: '500',
			fontStyle: 'normal',
			maxWidth: null,
			lineHeight: 1,
			padding: '6px',
		})

		elm.style.setProperty('width', textMeasurement.w + 'px')
	}, [editor, value, placeholder])

	useLayoutEffect(() => {
		// Focus the editor
		let raf = requestAnimationFrame(() => {
			raf = requestAnimationFrame(() => {
				ref.current?.focus()
			})
		})

		return () => {
			cancelAnimationFrame(raf)
		}
	}, [editor])

	const stopChatting = useCallback(() => {
		editor.updateInstanceState({ isChatting: false })
		container.focus()
	}, [editor, container])

	// Update the chat message as the user types
	const handleChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const { value } = e.target
			setValue(value.slice(0, 64))
			editor.updateInstanceState({ chatMessage: value })
		},
		[editor, setValue]
	)

	// Handle some keyboard shortcuts
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const elm = ref.current
			if (!elm) return

			// get this from the element so that this hook doesn't depend on value
			const { value: currentValue } = elm

			switch (e.key) {
				case 'Enter': {
					preventDefault(e)
					e.stopPropagation()

					// If the user hasn't typed anything, stop chatting
					if (!currentValue) {
						stopChatting()
						return
					}

					// Otherwise, 'send' the message
					setValue('')
					break
				}
				case 'Escape': {
					preventDefault(e)
					e.stopPropagation()
					stopChatting()
					break
				}
			}
		},
		[stopChatting, setValue]
	)

	const handlePaste = useCallback((e: ClipboardEvent) => {
		// todo: figure out what's an acceptable / sanitized paste
		preventDefault(e)
		e.stopPropagation()
	}, [])

	return (
		<input
			ref={ref}
			className={`tl-cursor-chat`}
			style={{ backgroundColor: editor.user.getColor() }}
			onBlur={stopChatting}
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			value={value}
			placeholder={placeholder}
			spellCheck={false}
		/>
	)
})
