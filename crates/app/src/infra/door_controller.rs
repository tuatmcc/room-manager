use rppal::gpio::Gpio;

pub struct DoorController {
    // GPIO pin for the door controller
    // This pin will be used to control the servo motor
    // that opens and closes the door
    _pin: u8,
}

impl DoorController {
    pub fn new(gpio_pin: u8) -> anyhow::Result<Self> {
        let gpio = Gpio::new()?;
        let mut pin = gpio.get(gpio_pin)?.into_output();
        pin.set_pwm(0, 0.0); // Initialize the pin to 0% duty cycle
        Ok(Self { _pin: gpio_pin })
    }
}

impl ServoController for DoorController {
    fn open(&self) -> anyhow::Result<()> {
        let gpio = Gpio::new()?;
        let mut pin = gpio.get(self._pin)?.into_output();
        pin.set_pwm(1, 0.5); // Set the duty cycle to 0.5 to open the door
        Ok(())
    }

    fn close(&self) -> anyhow::Result<()> {
        let gpio = Gpio::new()?;
        let mut pin = gpio.get(self._pin)?.into_output();
        pin.set_pwm(1, 0.0); // Set the duty cycle to 0.0 to close the door
        Ok(())
    }
}
