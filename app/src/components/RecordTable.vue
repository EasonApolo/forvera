<script setup lang="ts">
import { computed } from 'vue'

type RecordPlayer = {
	id: string
	name: string
}

type GameRecord = {
	round: number
	winnerId: string
}

const props = withDefaults(
	defineProps<{
		players: RecordPlayer[]
		records?: GameRecord[]
	}>(),
	{
		records: () => [],
	},
)

const rounds = computed(() => {
	return Array.from(new Set(props.records.map(record => record.round)))
		.filter(round => Number.isFinite(round))
		.sort((left, right) => right - left)
})

const winCountMap = computed(() => {
	const countMap = new Map<string, number>()
	props.players.forEach(player => {
		countMap.set(player.id, 0)
	})
	props.records.forEach(record => {
		if (!countMap.has(record.winnerId)) return
		countMap.set(record.winnerId, (countMap.get(record.winnerId) || 0) + 1)
	})
	return countMap
})

const getWinnerIdByRound = (round: number) => {
	return props.records.find(record => record.round === round)?.winnerId || ''
}

const getWinCount = (playerId: string) => {
	return winCountMap.value.get(playerId) || 0
}
</script>

<template>
	<div class="record-table-scroll">
		<table class="record-table">
			<colgroup>
				<col class="player-col" />
				<col class="summary-col" />
				<col v-for="round in rounds" :key="round" class="round-col" />
			</colgroup>
			<thead>
				<tr>
					<th scope="col" class="player-head">玩家</th>
					<th scope="col" class="summary-head">总计</th>
					<th v-for="round in rounds" :key="round" scope="col" class="round-head">{{ round }}</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="player in players" :key="player.id">
					<th scope="row" class="player-name-cell">{{ player.name }}</th>
					<td class="summary-cell">{{ getWinCount(player.id) }}</td>
					<td v-for="round in rounds" :key="round" class="round-cell">
						<span v-if="getWinnerIdByRound(round) === player.id" class="win-mark">✓</span>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<style scoped lang="less">
.record-table-scroll {
	overflow-x: auto;
}

.record-table {
	width: max-content;
	min-width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
	font-size: 14px;
}

.player-col {
	width: 120px;
}

.summary-col {
	width: 56px;
}

.round-col {
	width: 32px;
}

th,
td {
	padding: 8px 10px;
	text-align: center;
	border-bottom: 1px solid var(--border-light);
	white-space: nowrap;
}

thead th {
	font-weight: 700;
	background: var(--card-bg);
	position: sticky;
	top: 0;
	z-index: 1;
}

.player-head,
.player-name-cell {
	position: sticky;
	left: 0;
	z-index: 2;
	background: var(--card-bg);
	text-align: left;
}

.summary-head,
.summary-cell {
	font-weight: 700;
}

.round-head,
.round-cell {
	font-family: monospace;
}

.win-mark {
	color: #1890ff;
	font-weight: 700;
}
</style>
