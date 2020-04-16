export interface Game {
    game_id: string;
    created_at: Date;
    webhook_url: string;
    last_polled_at?: Date;
}