use std::time::Duration;

use crate::domain::ServoController;
use rppal::gpio::{Gpio, OutputPin};

pub struct DoorController {
    // Output pin for the door controller servo motor
    pin: OutputPin,
}

impl DoorController {
    pub fn new(gpio_pin: u8) -> anyhow::Result<Self> {
        let gpio = Gpio::new()?;
        let mut pin = gpio.get(gpio_pin)?.into_output();
        // Initialize the pin for PWM with a standard servo period (e.g., 20ms)
        // and set it to a default position (e.g., closed, 1ms pulse width)
        pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(1_000_000),
        )?;
        Ok(Self { pin })
    }
}

impl ServoController for DoorController {
    fn open(&mut self) -> anyhow::Result<()> {
        // Set the pulse width to open the door (e.g., 2ms for 180 degrees)
        self.pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(2_000_000),
        )?;
        Ok(())
    }

    fn close(&mut self) -> anyhow::Result<()> {
        // Set the pulse width to close the door (e.g., 1ms for 0 degrees)
        self.pin.set_pwm(
            Duration::from_nanos(20_000_000),
            Duration::from_nanos(1_000_000),
        )?;
        Ok(())
    }
}

