import { Socket } from 'socket.io'
import { BadRequest, NotFound } from '../models/ErrorModels'
import { CharacterInfo, LobbyInfo } from '../models/InfoModels'
import { characterModelToInfo } from '../utils/characterConverters'
import AuthService from './AuthService'
import CombatManager from './CombatManager'
import DatabaseService from './DatabaseService'

class LobbyService {
    private managingCombats: Map<string, Array<string>> = new Map()

    public getActiveCombats(lobby_id: string): string[] {
        return this.managingCombats.get(lobby_id) || []
    }

    public createCombat(
        lobby_id: string,
        combatNickname: string,
        preset: any,
        gm_id: string,
        players: string[]
    ): string | null {
        this.managingCombats.set(lobby_id, this.managingCombats.get(lobby_id) || [])
        const combats = this.managingCombats.get(lobby_id)
        if (combats) {
            const combatId = CombatManager.createCombat(combatNickname, preset, gm_id, players, () => {
                const index = combats.indexOf(combatId)
                if (index !== -1) {
                    combats.splice(index, 1)
                }
            })
            combats.push(combatId)
            return combatId
        }
        return null
    }

    public async getLobbyInfo(lobby_id: string, user: any, player: any): Promise<LobbyInfo> {
        const lobby = await DatabaseService.getLobby(lobby_id)
        if (!lobby) {
            return {
                name: 'Lobby not found',
                lobbyId: lobby_id,
                combats: [],
                gm: '',
                players: [],
                layout: 'default',
                controlledEntity: null,
            }
        }
        const combatInfo = []
        const combats = this.managingCombats.get(lobby_id)
        if (combats) {
            for (const combat_id in combats) {
                const combat = CombatManager.get(combat_id)
                if (combat) {
                    const playerIds = (await CombatManager.getPlayersInCombat(combat)) || []
                    const activePlayers = playerIds.map(async (playerId) => {
                        const userInDB = await DatabaseService.getUser(playerId)
                        return {
                            handle: userInDB?.handle || '',
                            nickname: lobby.players.find((p) => p.userId === playerId)?.nickname || '',
                        }
                    })
                    combatInfo.push({
                        nickname: combat?.combatNickname || '',
                        isActive: combat?.isActive() || false,
                        roundCount: combat?.isActive() ? combat?.getRoundCount() : 0,
                        _id: combat_id || '',
                        activePlayers: await Promise.all(activePlayers),
                    })
                }
            }
        }
        let name = ''
        let _id: string | null = null
        if (player.mainCharacter) {
            const entity = await DatabaseService.getEntity(player.mainCharacter)
            if (entity) {
                name = entity.descriptor
                _id = player.mainCharacter
            } else {
                name = 'Character not found'
                _id = ''
            }
        }
        const getCharacter = async (characterId: string) => {
            const entity = await DatabaseService.getEntity(characterId)
            if (!entity) {
                return null
            }
            return {
                name: entity.decorations?.name || `${entity.descriptor}.name`,
                sprite: entity.decorations?.sprite || `${entity.descriptor}.sprite`,
            }
        }
        const players = []
        for (const p of lobby.players) {
            const character = p.characterId ? await getCharacter(p.characterId) : null
            const player = await DatabaseService.getUser(p.userId)
            players.push({
                player: { handle: player?.handle || '', avatar: '', userId: p.userId, nickname: p.nickname },
                character,
            })
        }
        return {
            name: lobby.name,
            lobbyId: lobby_id,
            combats: combatInfo || [],
            gm: lobby.gm_id,
            players,
            layout: user._id === lobby.gm_id ? 'gm' : 'default',
            controlledEntity: _id ? { name, id: _id } : null,
        }
    }

    public async addPlayerToLobby(
        lobby_id: string,
        player_id: string,
        nickname: string,
        mainCharacter: string
    ): Promise<void> {
        await DatabaseService.addPlayerToLobby(lobby_id, player_id, nickname, mainCharacter)
    }

    public manageSocket(socket: Socket, combat_id: string, userToken: string): void {
        const combat = CombatManager.get(combat_id)
        if (!combat) {
            console.log('Combat not found')
            return this.disconnectSocket(socket)
        }
        let user_id: string
        try {
            const { _id } = AuthService.verifyAccessToken(userToken)
            user_id = _id
        } catch (e) {
            socket.emit('invalid_token')
            console.log('Error verifying token')
            return this.disconnectSocket(socket)
        }
        if (combat.isPlayerInCombat(user_id)) {
            console.log('Player is in combat')
            return this.disconnectSocket(socket)
        }
        combat.handlePlayer(user_id, socket)
    }

    private disconnectSocket(socket: Socket): void {
        socket.disconnect()
    }

    public async getMyCharacterInfo(lobby_id: string, player_id: string): Promise<CharacterInfo> {
        const lobby = await DatabaseService.getLobby(lobby_id)
        if (!lobby) throw new NotFound('Lobby not found')
        const player = lobby.players.find((p) => p.userId === player_id)
        if (!player) throw new NotFound('Player not found')
        if (!player.characterId) throw new BadRequest('Player has no character')
        const character = await DatabaseService.getCharacter(player.characterId)
        if (!character) throw new NotFound('Character not found')
        return characterModelToInfo(character)
    }

    public async getCharacterInfo(lobby_id: string, character_id: string): Promise<CharacterInfo> {
        const lobby = await DatabaseService.getLobby(lobby_id)
        if (!lobby) throw new NotFound('Lobby not found')
        const character = await DatabaseService.getCharacter(character_id)
        if (!character) throw new NotFound('Character not found')
        return characterModelToInfo(character)
    }
}

export default new LobbyService()
