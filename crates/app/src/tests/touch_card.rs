use mockall::predicate::*;
use mockall::*;

use crate::domain::{
    Card, CardApi, Clock, DoorLock, ErrorCode, SoundEvent, SoundPlayer, TouchCardResponse,
};
use std::{future::Future, pin::Pin};

// モッククラスの自動生成
mock! {
    pub CardApi {}
    impl CardApi for CardApi {
        async fn touch(&self, req: crate::domain::TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
    }
}

mock! {
    pub SoundPlayer {}
    impl SoundPlayer for SoundPlayer {
        fn play(&self, sound: SoundEvent) -> anyhow::Result<()>;
        fn reset(&self);
    }
}

mock! {
    pub Clock {}
    impl Clock for Clock {
        fn now(&self) -> chrono::DateTime<chrono::Local>;
    }
}

mock! {
    pub DoorLock {}
    impl DoorLock for DoorLock {
        async fn unlock(&self) -> anyhow::Result<()>;
        async fn lock_with_sensor_check<S>(&self, door_sensor: &mut S) -> anyhow::Result<bool>
        where
            S: crate::domain::DoorSensor;
    }
}

#[derive(Debug, Default)]
pub struct MockDoorSensor;

impl MockDoorSensor {
    pub fn new() -> Self {
        Self
    }
}

impl crate::domain::DoorSensor for MockDoorSensor {
    fn is_door_open(&self) -> Pin<Box<dyn Future<Output = anyhow::Result<bool>> + Send + '_>> {
        Box::pin(async { Ok(false) })
    }

    fn measure_distance(&self) -> Pin<Box<dyn Future<Output = anyhow::Result<f32>> + Send + '_>> {
        Box::pin(async { Ok(0.0) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::TouchCardUseCase;
    use crate::domain::TouchCardRequest;
    use chrono::{Local, TimeZone};

    #[tokio::test]
    async fn test_entry_morning() {
        // 学生証のモックデータ
        let card_id = Card {
            idm: "0123456789abcdef".to_string(),
            student_id: Some(12_345_678),
            balance: None,
        };

        // 時計のモック設定（午前9時に固定）
        let mock_time = Local.with_ymd_and_hms(2025, 4, 21, 9, 0, 0).unwrap();
        let mut mock_clock = MockClock::new();
        mock_clock
            .expect_now()
            .times(1)
            .returning(move || mock_time);

        // API通信のモック設定
        let mut mock_api = MockCardApi::new();
        mock_api
            .expect_touch()
            .with(function(
                |req: &TouchCardRequest| matches!(req.student_id, Some(id) if id == 12_345_678),
            ))
            .times(1)
            .returning(|_| Ok(TouchCardResponse::success_entry(5)));

        // サウンドプレイヤーのモック設定
        let mut mock_player = MockSoundPlayer::new();
        mock_player.expect_reset().times(1).return_const(());
        mock_player
            .expect_play()
            .with(eq(SoundEvent::Touch))
            .times(1)
            .returning(|_| Ok(()));
        mock_player
            .expect_play()
            .with(eq(SoundEvent::GoodMorning))
            .times(1)
            .returning(|_| Ok(()));

        let mut mock_door_lock = MockDoorLock::new();
        mock_door_lock.expect_unlock().times(1).returning(|| Ok(()));

        let mock_door_sensor = MockDoorSensor::new();

        // テスト実行
        let use_case = TouchCardUseCase::new(
            mock_api,
            mock_player,
            mock_clock,
            mock_door_lock,
            mock_door_sensor,
        );

        // executeを非同期で直接呼び出す
        use_case.execute(&card_id).await.unwrap();
    }

    #[tokio::test]
    async fn test_exit_last_person() {
        // Suicaカードのモックデータ
        let card_id = Card {
            idm: "0123456789abcdef".to_string(),
            student_id: None,
            balance: Some(1234),
        };

        // 時計のモック設定（夕方18時に固定だが、退出時には使用されない）
        let _mock_time = Local.with_ymd_and_hms(2025, 4, 21, 18, 0, 0).unwrap();
        let mock_clock = MockClock::new();
        // 退出時には時計は使われないため、expectationは設定しない

        // API通信のモック設定
        let mut mock_api = MockCardApi::new();
        mock_api
            .expect_touch()
            .with(function(|req: &TouchCardRequest| {
                req.idm == "0123456789abcdef"
            }))
            .times(1)
            .returning(|_| Ok(TouchCardResponse::success_exit(0))); // 最後の退出（残り0人）

        // サウンドプレイヤーのモック設定
        let mut mock_player = MockSoundPlayer::new();
        mock_player.expect_reset().times(1).return_const(());
        mock_player
            .expect_play()
            .with(eq(SoundEvent::Touch))
            .times(1)
            .returning(|_| Ok(()));
        mock_player
            .expect_play()
            .with(eq(SoundEvent::GoodBye))
            .times(1)
            .returning(|_| Ok(()));
        mock_player
            .expect_play()
            .with(eq(SoundEvent::Last))
            .times(1)
            .returning(|_| Ok(()));

        // ドアロックのモック設定
        let mut mock_door_lock = MockDoorLock::new();
        mock_door_lock.expect_unlock().times(1).returning(|| Ok(()));

        let mock_door_sensor = MockDoorSensor::new();

        // テスト実行
        let use_case = TouchCardUseCase::new(
            mock_api,
            mock_player,
            mock_clock,
            mock_door_lock,
            mock_door_sensor,
        );

        // executeを非同期で直接呼び出す
        use_case.execute(&card_id).await.unwrap();
    }

    #[tokio::test]
    async fn test_unregistered_card() {
        // 未登録の学生証
        let card_id = Card {
            idm: "0123456789abcdef".to_string(),
            student_id: Some(99_999_999),
            balance: None,
        };

        // API通信のモック設定
        let mut mock_api = MockCardApi::new();
        mock_api.expect_touch().times(1).returning(|_| {
            Ok(TouchCardResponse::error(
                ErrorCode::StudentCardNotRegistered,
                "学生証が登録されていません",
            ))
        });

        // サウンドプレイヤーのモック設定
        let mut mock_player = MockSoundPlayer::new();
        mock_player.expect_reset().times(1).return_const(());
        mock_player
            .expect_play()
            .with(eq(SoundEvent::Touch))
            .times(1)
            .returning(|_| Ok(()));
        mock_player
            .expect_play()
            .with(eq(SoundEvent::RegisterStudentCard))
            .times(1)
            .returning(|_| Ok(()));

        // 時計のモック
        let mock_clock = MockClock::new();

        // ドアロックのモック
        let mock_door_lock = MockDoorLock::new();

        let mock_door_sensor = MockDoorSensor::new();

        // テスト実行
        let use_case = TouchCardUseCase::new(
            mock_api,
            mock_player,
            mock_clock,
            mock_door_lock,
            mock_door_sensor,
        );

        // executeを非同期で直接呼び出す
        use_case.execute(&card_id).await.unwrap();
    }
}
