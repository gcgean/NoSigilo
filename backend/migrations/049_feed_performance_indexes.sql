-- Performance indexes for feed, scoring, and social queries
-- Without these, all feed scoring queries do full table scans

-- posts: order by date + filter by author
CREATE INDEX IF NOT EXISTS idx_posts_created_at     ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id        ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_created   ON posts(user_id, created_at DESC);

-- likes: count by target + user's own likes
CREATE INDEX IF NOT EXISTS idx_likes_target         ON likes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_target    ON likes(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_created_at     ON likes(created_at);

-- comments: count by target + user's own comments
CREATE INDEX IF NOT EXISTS idx_comments_target      ON comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_target ON comments(user_id, target_type, target_id);

-- profile_visits: visited and visitor lookups
CREATE INDEX IF NOT EXISTS idx_pv_visited           ON profile_visits(visited_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_visitor           ON profile_visits(visitor_user_id, created_at DESC);

-- messages: sender lookup for badge/mission counting
CREATE INDEX IF NOT EXISTS idx_messages_sender      ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv        ON messages(conversation_id, created_at DESC);

-- conversations: both sides of a conversation
CREATE INDEX IF NOT EXISTS idx_conv_user_a          ON conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_conv_user_b          ON conversations(user_b_id);

-- friend_requests: accepted friends lookup
CREATE INDEX IF NOT EXISTS idx_fr_from_status       ON friend_requests(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_fr_to_status         ON friend_requests(to_user_id, status);

-- blocks: blocker/blocked fast lookup (used in NOT EXISTS checks on every feed query)
CREATE INDEX IF NOT EXISTS idx_blocks_blocker       ON blocks(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked       ON blocks(blocked_user_id);

-- media: lookup by user + type (badge computation)
CREATE INDEX IF NOT EXISTS idx_media_user_type      ON media(user_id, mime_type);
CREATE INDEX IF NOT EXISTS idx_media_user_private   ON media(user_id, is_private);

-- notifications: unread count lookup
CREATE INDEX IF NOT EXISTS idx_notif_user_read      ON notifications(user_id, is_read);

-- user_badges: badge type lookup
CREATE INDEX IF NOT EXISTS idx_ubadges_user         ON user_badges(user_id);

-- stories: active stories lookup
CREATE INDEX IF NOT EXISTS idx_stories_user         ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires      ON stories(expires_at);
