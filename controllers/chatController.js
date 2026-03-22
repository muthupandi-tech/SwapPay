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

            console.log("Fetching chat for swap:", swapId);

            // 1. Verify existence & Auth across both schemas
            let isAuthorized = false;

            const [swapRows] = await pool.execute('SELECT * FROM swaps WHERE id = ?', [swapId]);
            
            if (swapRows.length > 0) {
                const swap = swapRows[0];
                if (swap.user_id === userId || swap.matched_user_id === userId) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized) {
                const [matchRows] = await pool.execute('SELECT requester_id, accepter_id FROM matches WHERE swap_id = ? AND (requester_id = ? OR accepter_id = ?)', [swapId, userId, userId]);
                if (matchRows.length > 0) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized) {
                return res.status(403).json({ error: 'Unauthorized to view this chat or swap not found' });
            }

            // 2. Fetch messages
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

            return res.json({ success: true, messages });
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
            const [swapRows] = await pool.execute('SELECT user_id, matched_user_id, status FROM swaps WHERE id = ?', [swapId]);
            if (swapRows.length === 0) return null;
            
            const swap = swapRows[0];
            let receiverId;

            // Resolve target receiver abstracting across legacy matching logic vs active DB Match system
            const [matchRows] = await pool.execute('SELECT requester_id, accepter_id FROM matches WHERE swap_id = ?', [swapId]);
            if (matchRows.length > 0) {
                const match = matchRows[0];
                receiverId = (match.requester_id === parseInt(senderId)) ? match.accepter_id : match.requester_id;
            } else {
                receiverId = (swap.user_id === parseInt(senderId)) ? swap.matched_user_id : swap.user_id;
            }


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
