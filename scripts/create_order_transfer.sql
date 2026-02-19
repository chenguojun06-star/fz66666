-- 创建订单转移表（SQL Server 版本）
-- 如需 MySQL 版本，请使用同目录的 create_order_transfer.mysql.sql
IF NOT EXISTS (
    SELECT 1
    FROM sys.objects
    WHERE object_id = OBJECT_ID(N'[dbo].[order_transfer]') AND type in (N'U')
)
BEGIN
    CREATE TABLE [dbo].[order_transfer] (
        [id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [order_id] VARCHAR(36) NOT NULL,
        [from_user_id] BIGINT NOT NULL,
        [to_user_id] BIGINT NOT NULL,
        [status] VARCHAR(20) NOT NULL CONSTRAINT DF_order_transfer_status DEFAULT ('pending'),
        [message] VARCHAR(500) NULL,
        [reject_reason] VARCHAR(500) NULL,
        [created_time] DATETIME NOT NULL CONSTRAINT DF_order_transfer_created DEFAULT (GETDATE()),
        [updated_time] DATETIME NOT NULL CONSTRAINT DF_order_transfer_updated DEFAULT (GETDATE()),
        [handled_time] DATETIME NULL
    );

    CREATE INDEX idx_order_id ON [dbo].[order_transfer] ([order_id]);
    CREATE INDEX idx_from_user_id ON [dbo].[order_transfer] ([from_user_id]);
    CREATE INDEX idx_to_user_id ON [dbo].[order_transfer] ([to_user_id]);
    CREATE INDEX idx_status ON [dbo].[order_transfer] ([status]);
END;
