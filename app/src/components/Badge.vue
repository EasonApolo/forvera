<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
	color?: string
	textColor?: string
	text?: string
	type?: 'loading' | 'empty'
	size?: 'small' | 'medium' | 'large'
}>(), {
	type: 'empty',
	size: 'small',
})

const badgeStyle = computed(() => ({
	backgroundColor: props.color || 'var(--quote-bg)',
	color: props.textColor || 'var(--text)',
}))
</script>

<template>
	<span
		class="badge"
		:class="[size, { loading: type === 'loading' }]"
		:style="badgeStyle"
	>
		<span v-if="type === 'loading'" class="badge-loading-icon"></span>
		<template v-if="text">{{ text }}</template>
		<template v-else>
			<slot></slot>
		</template>
	</span>
</template>

<style scoped lang="less">
.badge {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	white-space: nowrap;
	border-radius: 10px;
	gap: 2px;
	font-weight: 400;
}

.badge.small {
	padding: 1px 4px;
	font-size: 10px;
}

.badge.medium {
	padding: 2px 8px;
	font-size: 12px;
}

.badge.large {
	padding: 3px 10px;
	font-size: 13px;
}

.badge-loading-icon {
	width: 8px;
	height: 8px;
	border: 1px solid currentColor;
	border-top-color: transparent;
	border-radius: 50%;
	animation: spin 1s linear infinite;
	flex-shrink: 0;
	margin-right: 2px;
	align-self: center;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}

	to {
		transform: rotate(360deg);
	}
}
</style>