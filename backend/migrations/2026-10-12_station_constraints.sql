-- ผูก lockers.station_id เข้ากับ stations.station_id — รันเองใน phpMyAdmin (deploy ไม่ได้รันไฟล์นี้)

-- ขั้น 1: ตรวจก่อน ต้องได้ 0 แถว (ตู้ที่ผูกกับสาขาที่ไม่มีอยู่จริง)
SELECT l.locker_id, l.station_id
FROM lockers l LEFT JOIN stations s ON s.station_id = l.station_id
WHERE s.station_id IS NULL;

-- ขั้น 2: ผูก FK — ลบสาขาที่ยังมีตู้ไม่ได้ (ปิดด้วย status=0 แทน)
ALTER TABLE lockers
    ADD CONSTRAINT fk_lockers_station FOREIGN KEY (station_id)
        REFERENCES stations (station_id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- ย้อนกลับ (ถ้ามีปัญหา)
-- ALTER TABLE lockers DROP FOREIGN KEY fk_lockers_station;
