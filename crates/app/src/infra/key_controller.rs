use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use crate::domain::ServoController;
use rppal::gpio::{Gpio, OutputPin};

pub struct KeyController {
    pin: Rc<RefCell<OutputPin>>,
}

impl KeyController {
    pub fn new(gpio_pin: u8) -> anyhow::Result<Self> {
        let gpio = Gpio::new()?;
        let pin = gpio.get(gpio_pin)?.into_output();
        let pin = Rc::new(RefCell::new(pin));

        pin.borrow_mut().set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(1_000_000),
        )?;

        Ok(Self { pin })
    }
}

impl ServoController for KeyController {
    fn open(&self) -> anyhow::Result<()> {
        self.pin.borrow_mut().set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(2_000_000),
        )?;
        Ok(())
    }

    fn close(&self) -> anyhow::Result<()> {
        self.pin.borrow_mut().set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(1_000_000),
        )?;
        Ok(())
    }
}
