-- Main Domain Statistics Table
CREATE TABLE similarweb_domain_stats (
    site_name String,
    description String,
    title String,
    category String,
    is_small UInt8,
    snapshot_date DateTime,
    
    -- Engagement Metrics
    bounce_rate Float32,
    page_per_visit Float32,
    visits UInt32,
    time_on_site Float32,
    month UInt8,
    year UInt16,
    
    -- Estimated Monthly Visits
    visits_aug_2024 UInt32,
    visits_sep_2024 UInt32,
    visits_oct_2024 UInt32,
    
    -- Global and Country Rankings (Nullable as they might be null)
    global_rank Nullable(UInt32),
    country_rank Nullable(UInt32),
    country_code Nullable(String),
    category_rank Nullable(UInt32)
) ENGINE = MergeTree
ORDER BY (site_name, snapshot_date);

-- Traffic Sources Table
CREATE TABLE similarweb_traffic_sources (
    site_name String,
    snapshot_date DateTime,
    social_traffic Float32,
    paid_referrals_traffic Float32,
    mail_traffic Float32,
    referrals_traffic Float32,
    search_traffic Float32,
    direct_traffic Float32
) ENGINE = MergeTree
ORDER BY (site_name, snapshot_date);

-- Top Countries Table
CREATE TABLE similarweb_top_countries (
    site_name String,
    snapshot_date DateTime,
    country_code String,
    country_id UInt16,
    country_share Float32
) ENGINE = MergeTree
ORDER BY (site_name, snapshot_date);

-- Top Keywords Table
CREATE TABLE similarweb_top_keywords (
    site_name String,
    snapshot_date DateTime,
    keyword String,
    estimated_value Float32,
    volume UInt32,
    cpc Nullable(Float32)
) ENGINE = MergeTree
ORDER BY (site_name, snapshot_date);
