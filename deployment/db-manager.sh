#!/bin/bash

# 数据库快速管理脚本

case "$1" in
    start)
        echo "启动数据库..."
        docker start fashion-mysql-simple
        sleep 2
        docker ps | grep mysql
        ;;
    stop)
        echo "停止数据库..."
        docker stop fashion-mysql-simple
        ;;
    restart)
        echo "重启数据库..."
        docker restart fashion-mysql-simple
        sleep 2
        docker ps | grep mysql
        ;;
    status)
        echo "数据库状态:"
        docker ps -a | grep fashion-mysql-simple
        echo ""
        echo "数据卷:"
        docker volume ls | grep mysql-fashion-data
        ;;
    backup)
        echo "执行备份..."
        ./backup-database.sh
        ;;
    tables)
        echo "数据库表列表:"
        docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SHOW TABLES;" 2>/dev/null
        ;;
    count)
        echo "订单数量:"
        docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SELECT COUNT(*) as order_count FROM t_production_order;" 2>/dev/null
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|backup|tables|count}"
        echo ""
        echo "命令说明:"
        echo "  start   - 启动数据库容器"
        echo "  stop    - 停止数据库容器"
        echo "  restart - 重启数据库容器"
        echo "  status  - 查看数据库状态"
        echo "  backup  - 备份数据库"
        echo "  tables  - 查看所有表"
        echo "  count   - 查看订单数量"
        exit 1
        ;;
esac
