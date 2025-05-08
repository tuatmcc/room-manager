use anyhow::Result;
use rppal::i2c::I2c;
use std::cell::RefCell;

use crate::domain::I2cIrSensor;

pub struct DoorSensor {
    i2c: RefCell<I2c>,
}

impl DoorSensor {
    pub fn new(address: u16) -> Result<Self> {
        let mut i2c = I2c::new()?;
        i2c.set_slave_address(address)?;
        Ok(Self {
            i2c: RefCell::new(i2c),
        })
    }
}

impl I2cIrSensor for DoorSensor {
    fn read(&self) -> Result<u8> {
        let mut buffer = [0; 1];
        self.i2c.borrow_mut().read(&mut buffer)?;
        Ok(buffer[0])
    }
}
