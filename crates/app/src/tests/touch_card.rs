use mockall::predicate::*;
use mockall::*;

use crate::domain::{
    CardApi, CardId, CardReader, Clock, ErrorCode, SoundEvent, SoundPlayer, TouchCardResponse,
};

// モッククラスの自動生成
mock! {
    pub CardReader {}
    impl CardReader for CardReader {
        fn poll(&mut self) -> anyhow::Result<Option<CardId>>;
        async fn wait_release(&mut self, card: &CardId) -> anyhow::Result<()>;
    }
}

mock! {
    pub CardApi {}
    impl CardApi for CardApi {
        fn touch(&self, req: crate::domain::TouchCardRequest) -> anyhow::Result<TouchCardResponse>;
    }
}

mock! {
    pub SoundPlayer {}
    impl SoundPlayer for SoundPlayer {
        fn play(&self, sound: SoundEvent) -> anyhow::Result<()>;
    }
}

mock! {
    pub Clock {}
    impl Clock for Clock {
        fn now(&self) -> chrono::DateTime<chrono::Local>;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::TouchCardUseCase;
    use crate::domain::TouchCardRequest;
    use chrono::{Local, TimeZone};

    #[test]
    fn test_entry_morning() {
        // 学生証のモックデータ
        let card_id = CardId::Student {
            id: 12_345_678,
            felica_id: vec![0x01, 0x02, 0x03, 0x04],
        };

        // カードリーダーのモック設定（handle_cardを直接呼ぶのでpollは期待しない）
        let mock_reader = MockCardReader::new();

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
        mock_player
            .expect_play()
            .with(eq(SoundEvent::GoodMorning))
            .times(1)
            .returning(|_| Ok(()));

        // テスト実行
        let use_case = TouchCardUseCase::new(mock_reader, mock_api, mock_player, mock_clock);

        // handle_cardを直接呼び出す（pollを経由しない）
        let result = std::panic::catch_unwind(|| {
            use_case.handle_card(&card_id).unwrap();
        });

        assert!(result.is_ok());
    }

    #[test]
    fn test_exit_last_person() {
        // Suicaカードのモックデータ
        let card_id = CardId::Suica {
            idm: "0123456789abcdef".to_string(),
            felica_id: vec![0x01, 0x02, 0x03, 0x04],
        };

        // カードリーダーのモック設定（handle_cardを直接呼ぶのでpollは期待しない）
        let mock_reader = MockCardReader::new();

        // 時計のモック設定（夕方18時に固定だが、退出時には使用されない）
        let _mock_time = Local.with_ymd_and_hms(2025, 4, 21, 18, 0, 0).unwrap();
        let mock_clock = MockClock::new();
        // 退出時には時計は使われないため、expectationは設定しない

        // API通信のモック設定
        let mut mock_api = MockCardApi::new();
        mock_api
            .expect_touch()
            .with(function(|req: &TouchCardRequest| matches!(&req.suica_idm, Some(idm) if idm == "0123456789abcdef")))
            .times(1)
            .returning(|_| Ok(TouchCardResponse::success_exit(0))); // 最後の退出（残り0人）

        // サウンドプレイヤーのモック設定
        let mut mock_player = MockSoundPlayer::new();
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

        // テスト実行
        let use_case = TouchCardUseCase::new(mock_reader, mock_api, mock_player, mock_clock);

        // handle_cardを直接呼び出す（pollを経由しない）
        let result = std::panic::catch_unwind(|| {
            use_case.handle_card(&card_id).unwrap();
        });

        assert!(result.is_ok());
    }

    #[test]
    fn test_unregistered_card() {
        // 未登録の学生証
        let card_id = CardId::Student {
            id: 99_999_999,
            felica_id: vec![0x01, 0x02, 0x03, 0x04],
        };

        // カードリーダーのモック設定（handle_cardを直接呼ぶのでpollは期待しない）
        let mock_reader = MockCardReader::new();

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
        mock_player
            .expect_play()
            .with(eq(SoundEvent::RegisterStudentCard))
            .times(1)
            .returning(|_| Ok(()));

        // 時計のモック
        let mock_clock = MockClock::new();

        // テスト実行
        let use_case = TouchCardUseCase::new(mock_reader, mock_api, mock_player, mock_clock);

        // handle_cardを直接呼び出す（pollを経由しない）
        let result = std::panic::catch_unwind(|| {
            use_case.handle_card(&card_id).unwrap();
        });

        assert!(result.is_ok());
    }
}
