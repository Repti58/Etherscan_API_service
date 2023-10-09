import {Injectable, Logger} from '@nestjs/common'
import {PrismaService} from 'src/prisma.service'
import {Cron} from '@nestjs/schedule'

const START_BLOCK = process.env.START_BLOCK ?? 17583000

@Injectable()
export class PickerService {
	constructor(private prisma: PrismaService) {}
	private readonly logger = new Logger(PickerService.name)

	create(transactions: []) {
		return this.prisma.transactions.createMany({data: transactions})
	}

	getLastRecord() {
		const lastRecord = this.prisma.transactions.findFirst({
			orderBy: {
				id: 'desc',
			},
		})
		return lastRecord
	}

	async getLastBlockInChain() {
		try {
			const response = await fetch(
				'https://api.etherscan.io/api?module=proxy&action=eth_blockNumber'
			)
			const lastBlockInChain = (await response.json()).result
			return lastBlockInChain
		} catch (error) {
			console.error(error.message)
		}
	}

	async getBlock() {
		try {
			const lastRecord = await this.getLastRecord()
			let requestURI: string
			if (!lastRecord) {
				const block = START_BLOCK.toString(16)
				requestURI =
					`https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=0x${block}&boolean=true`
			} else {
				const lastBlockInList = lastRecord.blockNumber
				if (
					parseInt(await this.getLastBlockInChain(), 16) ===
					lastBlockInList
				) {
					console.log('last block reached')
					return
				}
				const nextBlock = (lastBlockInList + 1).toString(16)
				requestURI = `https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=0x${nextBlock}&boolean=true`
			}

			await new Promise((resolve) => setTimeout(resolve, 5000))
			const response = await fetch(requestURI)

			if (!response.ok) {
				throw new Error('Fetch error')
			}

			const blockData = await response.json()

			if (blockData.error) {
				throw new Error(blockData.error.message)
			}

			const transactions = blockData.result.transactions

			const transactionsData = transactions.map(
				(item: {
					blockNumber: string
					from: string
					to: string
					value: string
				}) => {
					const {blockNumber, from, to, value} = item
					return {
						blockNumber: parseInt(blockNumber, 16),
						from,
						to,
						value: parseInt(value, 16),
					}
				}
			)
			return this.create(transactionsData)
		} catch (error) {
			console.error(error.message)
		}
	}

	@Cron('0 * * * * *')
	handleCron() {
		this.logger.debug('Running a task every minute')
		this.getBlock()
	}
}