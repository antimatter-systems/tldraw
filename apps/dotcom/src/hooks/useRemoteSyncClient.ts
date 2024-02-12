import {
	TAB_ID,
	TLRecord,
	TLStore,
	TLStoreWithStatus,
	computed,
	createPresenceStateDerivation,
	defaultUserPreferences,
	getUserPreferences,
	useTLStore,
	useValue,
} from '@tldraw/tldraw'
import { TLSyncClient, schema } from '@tldraw/tlsync'
import { useEffect, useState } from 'react'
import { ClientWebSocketAdapter } from '../utils/remote-sync/ClientWebSocketAdapter'
import { RemoteSyncError, UseSyncClientConfig } from '../utils/remote-sync/remote-sync'
import { trackAnalyticsEvent } from '../utils/trackAnalyticsEvent'

const MULTIPLAYER_EVENT_NAME = 'multiplayer.client'

/** @public */
export type RemoteTLStoreWithStatus = Exclude<
	TLStoreWithStatus,
	{ status: 'synced-local' } | { status: 'not-synced' }
>

/** @public */
export function useRemoteSyncClient(opts: UseSyncClientConfig): RemoteTLStoreWithStatus {
	const [state, setState] = useState<{
		readyClient?: TLSyncClient<TLRecord, TLStore>
		error?: Error
	} | null>(null)
	const { uri, roomId = 'default', userPreferences: prefs, getAccessToken } = opts

	const store = useTLStore({ schema })

	useEffect(() => {
		const userPreferences = computed<{ id: string; color: string; name: string }>(
			'userPreferences',
			() => {
				const user = prefs?.get() ?? getUserPreferences()
				return {
					id: user.id,
					color: user.color ?? defaultUserPreferences.color,
					name: user.name ?? defaultUserPreferences.name,
				}
			}
		)

		const socket = new ClientWebSocketAdapter(async () => {
			// set sessionKey as a query param on the uri
			const withParams = new URL(uri)
			withParams.searchParams.set('sessionKey', TAB_ID)
			withParams.searchParams.set('storeId', store.id)
			const accessToken = await getAccessToken?.()
			if (accessToken) {
				withParams.searchParams.set('accessToken', accessToken)
			}
			return withParams.toString()
		})

		let didCancel = false

		const client = new TLSyncClient({
			store,
			socket,
			didCancel: () => didCancel,
			onLoad(client) {
				trackAnalyticsEvent(MULTIPLAYER_EVENT_NAME, { name: 'load', roomId })
				setState({ readyClient: client })
			},
			onLoadError(err) {
				trackAnalyticsEvent(MULTIPLAYER_EVENT_NAME, { name: 'load-error', roomId })
				console.error(err)
				setState({ error: err })
			},
			onSyncError(reason) {
				trackAnalyticsEvent(MULTIPLAYER_EVENT_NAME, { name: 'sync-error', roomId, reason })
				setState({ error: new RemoteSyncError(reason) })
			},
			onAfterConnect() {
				// if the server crashes and loses all data it can return an empty document
				// when it comes back up. This is a safety check to make sure that if something like
				// that happens, it won't render the app broken and require a restart. The user will
				// most likely lose all their changes though since they'll have been working with pages
				// that won't exist. There's certainly something we can do to make this better.
				// but the likelihood of this happening is very low and maybe not worth caring about beyond this.
				store.ensureStoreIsUsable()
			},
			presence: createPresenceStateDerivation(userPreferences)(store),
		})

		return () => {
			didCancel = true
			client.close()
			socket.close()
		}
	}, [getAccessToken, prefs, roomId, store, uri])

	return useValue<RemoteTLStoreWithStatus>(
		'remote synced store',
		() => {
			if (!state) return { status: 'loading' }
			if (state.error) return { status: 'error', error: state.error }
			if (!state.readyClient) return { status: 'loading' }
			const connectionStatus = state.readyClient.socket.connectionStatus
			return {
				status: 'synced-remote',
				connectionStatus: connectionStatus === 'error' ? 'offline' : connectionStatus,
				store: state.readyClient.store,
			}
		},
		[state]
	)
}
