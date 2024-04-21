import { CombatConnection } from './CombatConnection'

class CombatManager {
    private combats: Map<string, CombatConnection> = new Map()
    private managedSoFar: number = 0

    public get(combat_id: string): CombatConnection | undefined {
        return this.combats.get(combat_id)
    }

    public createCombat(
        combatNickname: string,
        preset: any,
        gm_id: string,
        players: string[],
        onDeleted: () => void
    ): string {
        const combat_id = (this.managedSoFar++).toString()
        const removeSelf = () => {
            this.combats.delete(combat_id)
            onDeleted()
        }
        this.combats.set(combat_id, new CombatConnection(combatNickname, preset, removeSelf, gm_id, players))
        console.log('Combat created', combat_id)
        return combat_id
    }
}

export default new CombatManager()
