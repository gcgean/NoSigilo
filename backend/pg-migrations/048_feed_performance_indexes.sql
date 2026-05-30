-- Performance indexes for feed, scoring, and social queries
CREATE INDEX IF NOT EXISTS idx_posts_created_at     ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id        ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_created   ON posts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_target         ON likes(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_target    ON likes(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_likes_created_at     ON likes(created_at);

CREATE INDEX IF NOT EXISTS idx_comments_target      ON comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_target ON comments(user_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_pv_visited           ON profile_visits(visited_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_visitor           ON profile_visits(visitor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender      ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv        ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_user_a          ON conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_conv_user_b          ON conversations(user_b_id);

CREATE INDEX IF NOT EXISTS idx_fr_from_status       ON friend_requests(from_user_id, status);
CREATE INDEX IF NOT EXISTS idx_fr_to_status         ON friend_requests(to_user_id, status);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker       ON blocks(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked       ON blocks(blocked_user_id);

CREATE INDEX IF NOT EXISTS idx_media_user_type      ON media(user_id, mime_type);
CREATE INDEX IF NOT EXISTS idx_media_user_private   ON media(user_id, is_private);

CREATE INDEX IF NOT EXISTS idx_notif_user_read      ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ubadges_user         ON user_badges(user_id);

CREATE INDEX IF NOT EXISTS idx_stories_user         ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires      ON stories(expires_at);
