const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'mysqlpandi',
    database: 'swappay',
});

const chatController = {
    /**
     * Retrieves chat history for a specific swap room.
     * Route handles authentication and authorization (verifying the user is part of the swap).
     */
    getChatHistory: async (req, res) => {
        try {
            const swapId = req.params.swapId;
            const userId = req.session.userId;

            // 1. Verify the swap exists and the user is involved in it
            const [swapRows] = await pool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);
            if (swapRows.length === 0) {
                return res.status(404).json({ error: 'Swap not found' });
            }
            const swap = swapRows[0];

            if (swap.user_id !== userId && swap.matched_user_id !== userId) {
                return res.status(403).json({ error: 'Unauthorized to view this chat' });
            }
            
            // Only allow chatting if the swap is matched
            if (swap.status !== 'matched') {
                return res.status(403).json({ error: 'Chat is only available for matched swaps' });
            }

            // 2. Fetch messages ordered by creation time
            const query = `
                SELECT 
                    cm.id, cm.swap_id, cm.sender_id, cm.message, cm.created_at, cm.status,
                    u.name as sender_name
                FROM chat_messages cm
                JOIN users u ON cm.sender_id = u.id
                WHERE cm.swap_id = ?
                ORDER BY cm.created_at ASC
            `;
            const [messages] = await pool.execute(query, [swapId]);

            res.json(messages);
        } catch (error) {
            console.error('Error fetching chat history:', error);
            res.status(500).json({ error: 'Failed to fetch chat history' });
        }
    },

    /**
     * System-level service to save a message directly from the socket connection.
     * Doesn't use HTTP Res. Returns the saved message with sender details.
     */
    saveMessage: async (swapId, senderId, message) => {
        try {
            // Check if swap is still active/matched
            const [swapRows] = await pool.execute('SELECT user_id, matched_user_id, status FROM swaps WHERE id = ?', [swapId]);
            if (swapRows.length === 0 || swapRows[0].status !== 'matched') {
                return null;
            }
            const swap = swapRows[0];
            const receiverId = (swap.user_id === parseInt(senderId)) ? swap.matched_user_id : swap.user_id;


            // Insert
            const [result] = await pool.execute(
                'INSERT INTO chat_messages (swap_id, sender_id, message) VALUES (?, ?, ?)',
                [swapId, senderId, message]
            );

            // Fetch back to return complete object including timestamp & sender name
            const [newMessage] = await pool.execute(`
                SELECT 
                    cm.id, cm.swap_id, cm.sender_id, cm.message, cm.created_at, cm.status,
                    u.name as sender_name
                FROM chat_messages cm
                JOIN users u ON cm.sender_id = u.id
                WHERE cm.id = ?
            `, [result.insertId]);

            const savedMsg = newMessage[0];
            savedMsg.receiverId = receiverId; // Add receiverId for server.js to use
            return savedMsg;
        } catch (error) {
            console.error('Error saving message:', error);
            throw error; // Let the socket logic handle it
        }
    },

    /**
     * Updates status for a single message.
     */
    updateMessageStatus: async (messageId, status) => {
        try {
            await pool.execute('UPDATE chat_messages SET status = ? WHERE id = ?', [status, messageId]);
            return true;
        } catch (error) {
            console.error('Error updating message status:', error);
            return false;
        }
    },

    /**
     * Marks all messages in a swap received by user as seen.
     */
    markMessagesAsSeen: async (swapId, userId) => {
        try {
            await pool.execute(
                'UPDATE chat_messages SET status = "seen" WHERE swap_id = ? AND sender_id != ? AND status != "seen"',
                [swapId, userId]
            );
            return true;
        } catch (error) {
            console.error('Error marking messages as seen:', error);
            return false;
        }
    },

    /**
     * Gets participants for a swap.
     */
    getSwapParticipants: async (swapId) => {
        try {
            const [rows] = await pool.execute('SELECT user_id, matched_user_id FROM swaps WHERE id = ?', [swapId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error getting swap participants:', error);
            return null;
        }
    }
};

module.exports = chatController;
