const express = require('express');
const PKPass = require('passkit-generator').PKPass;
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/passes', express.static('temp'));

// Enable CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Main pass generation endpoint
app.post('/generate-pass', async (req, res) => {
    try {
        // Extract fields from request
        const {
            appointmentDate,    // Date of appointment (string in ISO format)
            appointmentTime,    // Time of appointment (string in ISO format)
            appointmentType,    // Type of appointment (e.g., "Doctor Visit", "Dental Checkup")
            clientName,         // Name of the client
            providerName,       // Name of the provider/doctor
            location,           // Short location name for secondary field
            fullAddress,        // Full address for back field
            notes,              // Optional notes for the appointment
            backgroundColor,    // Optional background color (rgb format)
            latitude,           // Optional latitude (defaults to 40.7313 for demo)
            longitude           // Optional longitude (defaults to -74.0627 for demo)
        } = req.body;
        
        // Generate unique ID and download URL
        const uniqueId = Date.now().toString();
        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;

        // Read and update pass.json
        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
        
        // Update serial number
        passJson.serialNumber = uniqueId;
        
        // Update barcode with download URL
        passJson.barcode = {
            message: downloadUrl,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
            altText: "Scan for appointment"
        };
        
        // Calculate appointment date and time
        let appointmentDateTime;
        if (appointmentDate && appointmentTime) {
            // If both date and time provided separately
            appointmentDateTime = new Date(appointmentDate);
            const timeDate = new Date(appointmentTime);
            appointmentDateTime.setHours(timeDate.getHours(), timeDate.getMinutes());
        } else if (appointmentDate) {
            // If only appointmentDate provided (assuming it has time component)
            appointmentDateTime = new Date(appointmentDate);
        }
        
        // Calculate 10 minutes before appointment for notification
        if (appointmentDateTime) {
            const relevantDateTime = new Date(appointmentDateTime);
//            Shubham
            relevantDateTime.setMinutes(relevantDateTime.getMinutes());
            
            // Add relevantDate to passJson - this will trigger the notification
            passJson.relevantDate = relevantDateTime.toISOString();
        }
        
        // Ensure locations are set (using fixed coordinates for demo or from request)
        passJson.locations = [
            {
                latitude: latitude || 40.7313,
                longitude: longitude || -74.0627,
                relevantText: `Your ${appointmentType || 'appointment'} at ${location || 'the office'} is now.`
            }
        ];
        
        // Add barcodes array for newer iOS versions
        passJson.barcodes = [{
            message: downloadUrl,
            format: "PKBarcodeFormatQR",
            messageEncoding: "iso-8859-1",
            altText: "Scan for appointment"
        }];

        // Set background color if provided
        if (backgroundColor) {
            passJson.backgroundColor = backgroundColor;
        }

        // Update appointment date if provided
        if (appointmentDate) {
            passJson.eventTicket.headerFields[0].value = new Date(appointmentDate).toISOString();
        }

        // Update appointment type if provided
        if (appointmentType) {
            passJson.eventTicket.primaryFields[0].value = appointmentType;
        }

        // Update appointment time if provided
        if (appointmentTime) {
            passJson.eventTicket.secondaryFields[0].value = new Date(appointmentTime).toISOString();
        }

        // Update location if provided
        if (location) {
            passJson.eventTicket.secondaryFields[1].value = location;
        }

        // Update client name if provided
        if (clientName) {
            passJson.eventTicket.auxiliaryFields[0].value = clientName;
        }

        // Update provider name if provided
        if (providerName) {
            passJson.eventTicket.auxiliaryFields[1].value = providerName;
        }

        // Update full address if provided
        if (fullAddress) {
            passJson.eventTicket.backFields[0].value = fullAddress;
        }

        // Update notes if provided
        if (notes) {
            passJson.eventTicket.backFields[1].value = notes;
        }

        // Prepare model files
        const modelFiles = {
            'pass.json': Buffer.from(JSON.stringify(passJson)),
            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
        };

        // Create pass instance
        const pass = new PKPass(modelFiles, {
            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
            signerKeyPassphrase: 'mysecretphrase'
        });

        // Generate pass buffer
        const buffer = pass.getAsBuffer();
        
        // Ensure temp directory exists and save pass
        await fs.promises.mkdir('temp', { recursive: true });
        const passPath = path.join('temp', `${uniqueId}.pkpass`);
        await fs.promises.writeFile(passPath, buffer);

        // Send response
        res.json({
            success: true,
            passUrl: downloadUrl,
            passId: uniqueId,
            notificationTime: passJson.relevantDate // Include notification time in response
        });
    } catch (error) {
        console.error('Error details:', error);
        res.status(500).json({
            error: 'Failed to generate pass',
            details: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
//const express = require('express');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Enable CORS headers
//app.use((req, res, next) => {
//    res.header('Access-Control-Allow-Origin', '*');
//    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//    res.header('Access-Control-Allow-Headers', 'Content-Type');
//    next();
//});
//
//// Main pass generation endpoint
//app.post('/generate-pass', async (req, res) => {
//    try {
//        // Extract fields from request
//        const {
//            appointmentDate,    // Date of appointment (string in ISO format)
//            appointmentTime,    // Time of appointment (string in ISO format)
//            appointmentType,    // Type of appointment (e.g., "Doctor Visit", "Dental Checkup")
//            clientName,         // Name of the client
//            providerName,       // Name of the provider/doctor
//            location,           // Short location name for secondary field
//            fullAddress,        // Full address for back field
//            notes,              // Optional notes for the appointment
//            backgroundColor,    // Optional background color (rgb format)
//            latitude,           // Optional latitude (defaults to 40.7313 for demo)
//            longitude           // Optional longitude (defaults to -74.0627 for demo)
//        } = req.body;
//        
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number
//        passJson.serialNumber = uniqueId;
//        
//        // Update barcode with download URL
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "Scan for appointment"
//        };
//        
//        // Ensure locations are set (using fixed coordinates for demo or from request)
//        passJson.locations = [
//            {
//                latitude: latitude || 40.7313,
//                longitude: longitude || -74.0627,
//                relevantText: "Your appointment is nearby. Tap to get directions."
//            }
//        ];
//        
//        // Add barcodes array for newer iOS versions
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "Scan for appointment"
//        }];
//
//        // Set background color if provided
//        if (backgroundColor) {
//            passJson.backgroundColor = backgroundColor;
//        }
//
//        // Update appointment date if provided
//        if (appointmentDate) {
//            passJson.eventTicket.headerFields[0].value = new Date(appointmentDate);
//        }
//
//        // Update appointment type if provided
//        if (appointmentType) {
//            passJson.eventTicket.primaryFields[0].value = appointmentType;
//        }
//
//        // Update appointment time if provided
//        if (appointmentTime) {
//            passJson.eventTicket.secondaryFields[0].value = new Date(appointmentTime);
//        }
//
//        // Update location if provided
//        if (location) {
//            passJson.eventTicket.secondaryFields[1].value = location;
//        }
//
//        // Update client name if provided
//        if (clientName) {
//            passJson.eventTicket.auxiliaryFields[0].value = clientName;
//        }
//
//        // Update provider name if provided
//        if (providerName) {
//            passJson.eventTicket.auxiliaryFields[1].value = providerName;
//        }
//
//        // Update full address if provided
//        if (fullAddress) {
//            passJson.eventTicket.backFields[0].value = fullAddress;
//        }
//
//        // Update notes if provided
//        if (notes) {
//            passJson.eventTicket.backFields[1].value = notes;
//        }
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
//const express = require('express');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Enable CORS headers
//app.use((req, res, next) => {
//    res.header('Access-Control-Allow-Origin', '*');
//    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//    res.header('Access-Control-Allow-Headers', 'Content-Type');
//    next();
//});
//
//// Main pass generation endpoint
//app.post('/generate-pass', async (req, res) => {
//    try {
//        // Extract fields from request
//        const {
//            appointmentDate,    // Date of appointment (string in ISO format)
//            appointmentTime,    // Time of appointment (string in ISO format)
//            appointmentType,    // Type of appointment (e.g., "Doctor Visit", "Dental Checkup")
//            clientName,         // Name of the client
//            providerName,       // Name of the provider/doctor
//            location,           // Short location name for secondary field
//            fullAddress,        // Full address for back field
//            notes,              // Optional notes for the appointment
//            backgroundColor     // Optional background color (rgb format)
//        } = req.body;
//        
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number
//        passJson.serialNumber = uniqueId;
//        
//        // Update barcode with download URL
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "Scan for appointment"
//        };
//        
//        // Add barcodes array for newer iOS versions
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "Scan for appointment"
//        }];
//
//        // Set background color if provided
//        if (backgroundColor) {
//            passJson.backgroundColor = backgroundColor;
//        }
//
//        // Update appointment date if provided
//        if (appointmentDate) {
//            passJson.eventTicket.headerFields[0].value = new Date(appointmentDate);
//        }
//
//        // Update appointment type if provided
//        if (appointmentType) {
//            passJson.eventTicket.primaryFields[0].value = appointmentType;
//        }
//
//        // Update appointment time if provided
//        if (appointmentTime) {
//            passJson.eventTicket.secondaryFields[0].value = new Date(appointmentTime);
//        }
//
//        // Update location if provided
//        if (location) {
//            passJson.eventTicket.secondaryFields[1].value = location;
//        }
//
//        // Update client name if provided
//        if (clientName) {
//            passJson.eventTicket.auxiliaryFields[0].value = clientName;
//        }
//
//        // Update provider name if provided
//        if (providerName) {
//            passJson.eventTicket.auxiliaryFields[1].value = providerName;
//        }
//
//        // Update full address if provided
//        if (fullAddress) {
//            passJson.eventTicket.backFields[0].value = fullAddress;
//        }
//
//        // Update notes if provided
//        if (notes) {
//            passJson.eventTicket.backFields[1].value = notes;
//        }
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
//const express = require('express');
//const multer = require('multer');
//const sharp = require('sharp');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//const { v4: uuidv4 } = require('uuid');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Default sky blue color
//const DEFAULT_BACKGROUND_COLOR = "rgb(41, 128, 185)";
//
//// Multer configuration for file uploads
//const upload = multer({
//    storage: multer.diskStorage({
//        destination: '/tmp',
//        filename: (req, file, cb) => {
//            cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
//        }
//    }),
//    fileFilter: (req, file, cb) => {
//        if (file.mimetype.startsWith('image/')) {
//            cb(null, true);
//        } else {
//            cb(new Error('Only image files are allowed'));
//        }
//    },
//    limits: {
//        fileSize: 5 * 1024 * 1024 // 5MB limit
//    }
//});
//
//// Helper function to parse RGB color
//function parseRGBColor(rgbString) {
//    const matches = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
//    if (!matches) return parseRGBColor(DEFAULT_BACKGROUND_COLOR); // Use default color if invalid
//    return {
//        r: parseInt(matches[1]),
//        g: parseInt(matches[2]),
//        b: parseInt(matches[3])
//    };
//}
//
//// Image processing function
//async function processStripImage(inputPath, backgroundColor) {
//    const outputDir = '/tmp';
//    const baseFilename = uuidv4();
//    const shadowColor = parseRGBColor(backgroundColor || DEFAULT_BACKGROUND_COLOR);
//    
//    try {
//        // Generate three resolutions
//        await sharp(inputPath)
//            .resize(375, 123, { fit: 'cover' })
//            .modulate({ brightness: 0.7 })
//            .png()
//            .toFile(path.join(outputDir, 'strip.png'));
//
//        await sharp(inputPath)
//            .resize(750, 246, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 750,
//                        height: 246,
//                        channels: 4,
//                        background: { ...shadowColor, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@2x.png'));
//
//        await sharp(inputPath)
//            .resize(1125, 369, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 1125,
//                        height: 369,
//                        channels: 4,
//                        background: { ...shadowColor, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@3x.png'));
//
//        return {
//            strip: path.join(outputDir, 'strip.png'),
//            strip2x: path.join(outputDir, 'strip@2x.png'),
//            strip3x: path.join(outputDir, 'strip@3x.png')
//        };
//    } catch (error) {
//        throw new Error(`Image processing failed: ${error.message}`);
//    }
//}
//
//// Cleanup function
//function cleanupFiles(files) {
//    files.forEach(file => {
//        if (fs.existsSync(file)) {
//            fs.unlinkSync(file);
//        }
//    });
//}
//
//// Main pass generation endpoint
//app.post('/generate-pass', upload.single('stripImage'), async (req, res) => {
//    const filesToCleanup = [];
//    
//    try {
//        // Extract fields from request
//        const { expiryDate, serviceType, discount, backgroundColor } = req.body;
//        
//        // Process uploaded image if provided
//        let stripImages = null;
//        if (req.file) {
//            filesToCleanup.push(req.file.path);
//            stripImages = await processStripImage(req.file.path, backgroundColor || DEFAULT_BACKGROUND_COLOR);
//            Object.values(stripImages).forEach(path => filesToCleanup.push(path));
//        }
//
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number and barcode
//        passJson.serialNumber = uniqueId;
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        };
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Set background color from request or use default sky blue
//        passJson.backgroundColor = backgroundColor || DEFAULT_BACKGROUND_COLOR;
//
//        // Update discount and service type
//        passJson.coupon.primaryFields[0].value = discount.includes('%') ?
//            `${discount} OFF` :
//            `$${discount} OFF`;
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//
//        // Update expiry date
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            expirationDate.setDate(expirationDate.getDate() + 1);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Add strip images if they were processed
//        if (stripImages) {
//            modelFiles['strip.png'] = fs.readFileSync(stripImages.strip);
//            modelFiles['strip@2x.png'] = fs.readFileSync(stripImages.strip2x);
//            modelFiles['strip@3x.png'] = fs.readFileSync(stripImages.strip3x);
//        }
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Clean up temporary files
//        cleanupFiles(filesToCleanup);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        // Clean up files in case of error
//        cleanupFiles(filesToCleanup);
//        
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Error handling middleware
//app.use((err, req, res, next) => {
//    console.error(err.stack);
//    res.status(500).json({
//        error: 'Something went wrong!',
//        details: err.message
//    });
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
//// app.js final with all things
//const express = require('express');
//const multer = require('multer');
//const sharp = require('sharp');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//const { v4: uuidv4 } = require('uuid');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Multer configuration for file uploads
//const upload = multer({
//    storage: multer.diskStorage({
//        destination: '/tmp',
//        filename: (req, file, cb) => {
//            cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
//        }
//    }),
//    fileFilter: (req, file, cb) => {
//        if (file.mimetype.startsWith('image/')) {
//            cb(null, true);
//        } else {
//            cb(new Error('Only image files are allowed'));
//        }
//    },
//    limits: {
//        fileSize: 5 * 1024 * 1024 // 5MB limit
//    }
//});
//
//// Helper function to parse RGB color
//function parseRGBColor(rgbString) {
//    const matches = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
//    if (!matches) return { r: 60, g: 65, b: 76 }; // Default color
//    return {
//        r: parseInt(matches[1]),
//        g: parseInt(matches[2]),
//        b: parseInt(matches[3])
//    };
//}
//
//// Image processing function
//async function processStripImage(inputPath, backgroundColor) {
//    const outputDir = '/tmp';
//    const baseFilename = uuidv4();
//    const shadowColor = parseRGBColor(backgroundColor);
//    
//    try {
//        // Generate three resolutions
//        await sharp(inputPath)
//            .resize(375, 123, { fit: 'cover' })
//            .modulate({ brightness: 0.7 })
//            .png()
//            .toFile(path.join(outputDir, 'strip.png'));
//
//        await sharp(inputPath)
//            .resize(750, 246, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 750,
//                        height: 246,
//                        channels: 4,
//                        background: { ...shadowColor, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@2x.png'));
//
//        await sharp(inputPath)
//            .resize(1125, 369, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 1125,
//                        height: 369,
//                        channels: 4,
//                        background: { ...shadowColor, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@3x.png'));
//
//        return {
//            strip: path.join(outputDir, 'strip.png'),
//            strip2x: path.join(outputDir, 'strip@2x.png'),
//            strip3x: path.join(outputDir, 'strip@3x.png')
//        };
//    } catch (error) {
//        throw new Error(`Image processing failed: ${error.message}`);
//    }
//}
//
//// Cleanup function
//function cleanupFiles(files) {
//    files.forEach(file => {
//        if (fs.existsSync(file)) {
//            fs.unlinkSync(file);
//        }
//    });
//}
//
//// Main pass generation endpoint
//app.post('/generate-pass', upload.single('stripImage'), async (req, res) => {
//    const filesToCleanup = [];
//    
//    try {
//        // Extract fields from request
//        const { expiryDate, serviceType, discount, backgroundColor } = req.body;
//        
//        // Process uploaded image if provided
//        let stripImages = null;
//        if (req.file) {
//            filesToCleanup.push(req.file.path);
//            stripImages = await processStripImage(req.file.path, backgroundColor || "rgb(60, 65, 76)");
//            Object.values(stripImages).forEach(path => filesToCleanup.push(path));
//        }
//
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number and barcode
//        passJson.serialNumber = uniqueId;
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        };
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Set background color from request or default
//        passJson.backgroundColor = backgroundColor || "rgb(60, 65, 76)";
//
//        // Update discount and service type
//        passJson.coupon.primaryFields[0].value = discount.includes('%') ?
//            `${discount} OFF` :
//            `$${discount} OFF`;
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//
//        // Update expiry date
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            expirationDate.setDate(expirationDate.getDate() + 1);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Add strip images if they were processed
//        if (stripImages) {
//            modelFiles['strip.png'] = fs.readFileSync(stripImages.strip);
//            modelFiles['strip@2x.png'] = fs.readFileSync(stripImages.strip2x);
//            modelFiles['strip@3x.png'] = fs.readFileSync(stripImages.strip3x);
//        }
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Clean up temporary files
//        cleanupFiles(filesToCleanup);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        // Clean up files in case of error
//        cleanupFiles(filesToCleanup);
//        
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Error handling middleware
//app.use((err, req, res, next) => {
//    console.error(err.stack);
//    res.status(500).json({
//        error: 'Something went wrong!',
//        details: err.message
//    });
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});

// this is lastest the image upload with perscent and dollar and color shaw
//// app.js
//const express = require('express');
//const multer = require('multer');
//const sharp = require('sharp');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//const { v4: uuidv4 } = require('uuid');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Multer configuration for file uploads
//const upload = multer({
//    storage: multer.diskStorage({
//        destination: '/tmp',
//        filename: (req, file, cb) => {
//            cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
//        }
//    }),
//    fileFilter: (req, file, cb) => {
//        if (file.mimetype.startsWith('image/')) {
//            cb(null, true);
//        } else {
//            cb(new Error('Only image files are allowed'));
//        }
//    },
//    limits: {
//        fileSize: 5 * 1024 * 1024 // 5MB limit
//    }
//});
//
//// Image processing function
//async function processStripImage(inputPath) {
//    const outputDir = '/tmp';
//    const baseFilename = uuidv4();
//    
//    try {
//        // Generate three resolutions
//        await sharp(inputPath)
//            .resize(375, 123, { fit: 'cover' })
//            .modulate({ brightness: 0.7 }) // Reduces opacity to 70%
//            .png()
//            .toFile(path.join(outputDir, 'strip.png'));
//
//        await sharp(inputPath)
//            .resize(750, 246, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 750,
//                        height: 246,
//                        channels: 4,
//                        background: { r: 41, g: 128, b: 185, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@2x.png'));
//
//        await sharp(inputPath)
//            .resize(1125, 369, { fit: 'cover' })
//            .composite([{
//                input: {
//                    create: {
//                        width: 1125,
//                        height: 369,
//                        channels: 4,
//                        background: { r: 41, g: 128, b: 185, alpha: 0.5 }
//                    }
//                },
//                blend: 'over'
//            }])
//            .png()
//            .toFile(path.join(outputDir, 'strip@3x.png'));
//
//        return {
//            strip: path.join(outputDir, 'strip.png'),
//            strip2x: path.join(outputDir, 'strip@2x.png'),
//            strip3x: path.join(outputDir, 'strip@3x.png')
//        };
//    } catch (error) {
//        throw new Error(`Image processing failed: ${error.message}`);
//    }
//}
//
//// Cleanup function
//function cleanupFiles(files) {
//    files.forEach(file => {
//        if (fs.existsSync(file)) {
//            fs.unlinkSync(file);
//        }
//    });
//}
//
//// Main pass generation endpoint
//app.post('/generate-pass', upload.single('stripImage'), async (req, res) => {
//    const filesToCleanup = [];
//    
//    try {
//        // Extract fields from request
//        const { expiryDate, serviceType, discount } = req.body;
//        
//        // Process uploaded image if provided
//        let stripImages = null;
//        if (req.file) {
//            filesToCleanup.push(req.file.path);
//            stripImages = await processStripImage(req.file.path);
//            Object.values(stripImages).forEach(path => filesToCleanup.push(path));
//        }
//
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number and barcode
//        passJson.serialNumber = uniqueId;
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        };
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Update background color based on service type
//        switch(serviceType) {
//            case 'Service Type 1':
//                passJson.backgroundColor = "rgb(41, 128, 185)";
//                break;
//            case 'Service Type 2':
//                passJson.backgroundColor = "rgb(230, 126, 34)";
//                break;
//            case 'Service Type 3':
//                passJson.backgroundColor = "rgb(0, 0, 128)";
//                break;
//            case 'Service Type 4':
//                passJson.backgroundColor = "rgb(114, 62, 49)";
//                break;
//            default:
//                passJson.backgroundColor = "rgb(60, 65, 76)";
//        }
//
//        // Update discount and service type
////        passJson.coupon.primaryFields[0].value = `${discount} OFF`;
//        passJson.coupon.primaryFields[0].value = discount.includes('%') ?
//            `${discount} OFF` :
//            `$${discount} OFF`;
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//        // Update discount and service type
//
//        // Update expiry date
////        if (expiryDate) {
////            const expirationDate = new Date(expiryDate);
////            passJson.coupon.headerFields[0].value = expirationDate;
////        }
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            expirationDate.setDate(expirationDate.getDate() + 1);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Add strip images if they were processed
//        if (stripImages) {
//            modelFiles['strip.png'] = fs.readFileSync(stripImages.strip);
//            modelFiles['strip@2x.png'] = fs.readFileSync(stripImages.strip2x);
//            modelFiles['strip@3x.png'] = fs.readFileSync(stripImages.strip3x);
//        }
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Clean up temporary files
//        cleanupFiles(filesToCleanup);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        // Clean up files in case of error
//        cleanupFiles(filesToCleanup);
//        
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Error handling middleware
//app.use((err, req, res, next) => {
//    console.error(err.stack);
//    res.status(500).json({
//        error: 'Something went wrong!',
//        details: err.message
//    });
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});

// this works for image upload
//const express = require('express');
//const multer = require('multer');
//const sharp = require('sharp');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//const { v4: uuidv4 } = require('uuid');
//
//const app = express();
//
//// Middleware
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));
//app.use('/passes', express.static('temp'));
//
//// Multer configuration for file uploads
//const upload = multer({
//    storage: multer.diskStorage({
//        destination: '/tmp',
//        filename: (req, file, cb) => {
//            cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
//        }
//    }),
//    fileFilter: (req, file, cb) => {
//        if (file.mimetype.startsWith('image/')) {
//            cb(null, true);
//        } else {
//            cb(new Error('Only image files are allowed'));
//        }
//    },
//    limits: {
//        fileSize: 5 * 1024 * 1024 // 5MB limit
//    }
//});
//
//// Image processing function
//async function processStripImage(inputPath) {
//    const outputDir = '/tmp';
//    const baseFilename = uuidv4();
//    
//    try {
//        // Generate three resolutions
//        await sharp(inputPath)
//            .resize(375, 123, { fit: 'cover' })
//            .modulate({ brightness: 0.7 }) // Reduces opacity to 70%
//            .png()
//            .toFile(path.join(outputDir, 'strip.png'));
//
//        await sharp(inputPath)
//            .resize(750, 246, { fit: 'cover' })
//            .modulate({ brightness: 0.7 })
//            .png()
//            .toFile(path.join(outputDir, 'strip@2x.png'));
//
//        await sharp(inputPath)
//            .resize(1125, 369, { fit: 'cover' })
//            .modulate({ brightness: 0.7 })
//            .png()
//            .toFile(path.join(outputDir, 'strip@3x.png'));
//
//        return {
//            strip: path.join(outputDir, 'strip.png'),
//            strip2x: path.join(outputDir, 'strip@2x.png'),
//            strip3x: path.join(outputDir, 'strip@3x.png')
//        };
//    } catch (error) {
//        throw new Error(`Image processing failed: ${error.message}`);
//    }
//}
//
//// Cleanup function
//function cleanupFiles(files) {
//    files.forEach(file => {
//        if (fs.existsSync(file)) {
//            fs.unlinkSync(file);
//        }
//    });
//}
//
//// Main pass generation endpoint
//app.post('/generate-pass', upload.single('stripImage'), async (req, res) => {
//    const filesToCleanup = [];
//    
//    try {
//        // Extract fields from request
//        const { expiryDate, serviceType, discount } = req.body;
//        
//        // Process uploaded image if provided
//        let stripImages = null;
//        if (req.file) {
//            filesToCleanup.push(req.file.path);
//            stripImages = await processStripImage(req.file.path);
//            Object.values(stripImages).forEach(path => filesToCleanup.push(path));
//        }
//
//        // Generate unique ID and download URL
//        const uniqueId = Date.now().toString();
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read and update pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Update serial number and barcode
//        passJson.serialNumber = uniqueId;
//        passJson.barcode = {
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        };
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Update background color based on service type
//        switch(serviceType) {
//            case 'Service Type 1':
//                passJson.backgroundColor = "rgb(41, 128, 185)";
//                break;
//            case 'Service Type 2':
//                passJson.backgroundColor = "rgb(230, 126, 34)";
//                break;
//            case 'Service Type 3':
//                passJson.backgroundColor = "rgb(0, 0, 128)";
//                break;
//            case 'Service Type 4':
//                passJson.backgroundColor = "rgb(114, 62, 49)";
//                break;
//            default:
//                passJson.backgroundColor = "rgb(60, 65, 76)";
//        }
//
//        // Update discount and service type
//        passJson.coupon.primaryFields[0].value = `${discount}% OFF`;
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//
//        // Update expiry date
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Add strip images if they were processed
//        if (stripImages) {
//            modelFiles['strip.png'] = fs.readFileSync(stripImages.strip);
//            modelFiles['strip@2x.png'] = fs.readFileSync(stripImages.strip2x);
//            modelFiles['strip@3x.png'] = fs.readFileSync(stripImages.strip3x);
//        }
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        // Generate pass buffer
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists and save pass
//        await fs.promises.mkdir('temp', { recursive: true });
//        const passPath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(passPath, buffer);
//
//        // Clean up temporary files
//        cleanupFiles(filesToCleanup);
//
//        // Send response
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        // Clean up files in case of error
//        cleanupFiles(filesToCleanup);
//        
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message
//        });
//    }
//});
//
//// Error handling middleware
//app.use((err, req, res, next) => {
//    console.error(err.stack);
//    res.status(500).json({
//        error: 'Something went wrong!',
//        details: err.message
//    });
//});
//
//// Start server
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
//
//
//
//
//
//
//
//
//
//
//



















































//This version is for the strip image


//// Import required modules
//const express = require('express'); // Web framework for handling HTTP requests
//const PKPass = require('passkit-generator').PKPass; // Library for generating Apple Wallet passes
//const path = require('path'); // Utility module for working with file and directory paths
//const fs = require('fs'); // File system module for reading/writing files
//
//// Create an Express application
//const app = express();
//
//// Middleware to parse incoming JSON payloads in requests
//app.use(express.json());
//
//// Middleware to serve static files from the 'temp' directory
//// This allows users to access generated .pkpass files via a URL
//app.use('/passes', express.static('temp'));
//
//// Define an endpoint to handle pass generation requests
//app.post('/generate-pass', async (req, res) => {
//    try {
//        // Extract required fields from the incoming request body
//        const { expiryDate, serviceType, discount } = req.body;
//
//        // Generate a unique identifier based on the current timestamp
//        const uniqueId = Date.now().toString();
//
//        // Create a download URL for the generated pass
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//
//        // Read the base pass.json file and parse it into a JavaScript object
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//
//        // Add a QR code to the pass, encoding the download URL
//        passJson.barcode = {
//            message: downloadUrl, // URL encoded in the QR code
//            format: "PKBarcodeFormatQR", // QR code format
//            messageEncoding: "iso-8859-1", // Encoding for the message (character encoding standards-256 char[latin-1])
//            altText: "QR code" // Alternative text for accessibility
//        };
//
//        // Set a unique serial number for the pass
//        passJson.serialNumber = uniqueId;
//
//        // Update the pass background color based on the service type
//        switch(serviceType) {
//            case 'Service Type 1':
//                passJson.backgroundColor = "rgb(41, 128, 185)"; // Blue
//                break;
//            case 'Service Type 2':
//                passJson.backgroundColor = "rgb(230, 126, 34)"; // Orange
//                break;
//            case 'Service Type 3':
//                passJson.backgroundColor = "rgb(0, 0, 128)"; // Navy Blue
//                break;
//            case 'Service Type 4':
//                passJson.backgroundColor = "rgb(114, 62, 49)"; // Brown
//                break;
//            default:
//                passJson.backgroundColor = "rgb(60, 65, 76)"; // Default Gray
//        }
//
//        // Update the primary field with the discount information
//        passJson.coupon.primaryFields[0].value = `${discount}% OFF`;
//
//        // Update the secondary field with the service type, if provided
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//
//        // Update the header field with the expiry date, if provided
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//
//        // Add an array of barcodes for compatibility with newer iOS versions
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Prepare the necessary files for the pass model
////        const modelFiles = {
////            'pass.json': Buffer.from(JSON.stringify(passJson)), // Updated pass JSON file
////            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')), // Icon file
////            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')), // Retina icon
////            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png')) // High-resolution icon
////        };
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png')),
//            'strip.png': fs.readFileSync(path.join(__dirname, 'models/strip.png')),
//            'strip@2x.png': fs.readFileSync(path.join(__dirname, 'models/strip@2x.png')), // Retina version
//            'strip@3x.png': fs.readFileSync(path.join(__dirname, 'models/strip@3x.png'))  // High-res version
//        };
//        // Create an instance of the pass with the model files and certificates
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')), // Signing certificate
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')), // Signing key
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')), // Apple WWDR certificate
//            signerKeyPassphrase: 'mysecretphrase' // Passphrase for the signing key
//        });
//
//        // Generate the pass as a buffer
//        const buffer = pass.getAsBuffer();
//
//        // Ensure the 'temp' directory exists
//        await fs.promises.mkdir('temp', { recursive: true });
//
//        // Write the generated pass to a file in the 'temp' directory
//        const filePath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(filePath, buffer);
//
//        // Send a JSON response with the download URL and unique ID
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        // Log error details and send a 500 response with error information
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message,
//            stack: error.stack
//        });
//    }
//});
//
//// Define the port for the server to listen on
//const PORT = process.env.PORT || 3000;
//
//// Start the server and listen for incoming requests
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//































//const express = require('express');
//const PKPass = require('passkit-generator').PKPass;
//const path = require('path');
//const fs = require('fs');
//
//const app = express();
//app.use(express.json());
//app.use('/passes', express.static('temp'));
//
//app.post('/generate-pass', async (req, res) => {
//    try {
//        const { expiryDate, serviceType, discount } = req.body;
//        
//        // Generate unique ID first
//        const uniqueId = Date.now().toString();
//        
//        // Generate the download URL for the pass
//        const downloadUrl = `${req.protocol}://${req.get('host')}/passes/${uniqueId}.pkpass`;
//        
//        // Read and modify pass.json
//        let passJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'models/pass.json')));
//        
//        // Set the QR code with the download URL
//        passJson.barcode = {
//            message: downloadUrl,  // This is the URL that will be in the QR code
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        };
//        
//        // Update serial number
//        passJson.serialNumber = uniqueId;
//        
//        // Set colors based on service type
//        switch(serviceType) {
//            case 'Service Type 1':
//                passJson.backgroundColor = "rgb(41, 128, 185)";
//                break;
//            case 'Service Type 2':
//                passJson.backgroundColor = "rgb(230, 126, 34)";
//                break;
//            case 'Service Type 3':
//                passJson.backgroundColor = "rgb(0, 0, 128)";  // Navy Blue
//                break;
//            case 'Service Type 4':
//                passJson.backgroundColor =
//                // Alternative premium options:
//                // "rgb(2, 28, 65)"    // Oxford Blue
//                // "rgb(32, 54, 77)"   // Dark Denim
//                 "rgb(114, 62, 49)"  ;// Rich Brown
//                break;
//            default:
//                passJson.backgroundColor = "rgb(60, 65, 76)";
//        }
//
//        // Update discount in primary fields
//        passJson.coupon.primaryFields[0].value = `${discount}% OFF`;
//        
//        // Update service type if provided
//        if (serviceType) {
//            passJson.coupon.secondaryFields[0].value = serviceType;
//        }
//
//        // Update expiry date in header fields if provided
//        if (expiryDate) {
//            const expirationDate = new Date(expiryDate);
//            passJson.coupon.headerFields[0].value = expirationDate;
//        }
//
//        // Add barcodes array for newer iOS versions
//        passJson.barcodes = [{
//            message: downloadUrl,
//            format: "PKBarcodeFormatQR",
//            messageEncoding: "iso-8859-1",
//            altText: "QR code"
//        }];
//
//        // Prepare model files
//        const modelFiles = {
//            'pass.json': Buffer.from(JSON.stringify(passJson)),
//            'icon.png': fs.readFileSync(path.join(__dirname, 'models/icon.png')),
//            'icon@2x.png': fs.readFileSync(path.join(__dirname, 'models/icon@2x.png')),
//            'icon@3x.png': fs.readFileSync(path.join(__dirname, 'models/icon@3x.png'))
//        };
//
//        // Create pass instance
//        const pass = new PKPass(modelFiles, {
//            signerCert: fs.readFileSync(path.join(__dirname, 'certs/signerCert.pem')),
//            signerKey: fs.readFileSync(path.join(__dirname, 'certs/signerKey.pem')),
//            wwdr: fs.readFileSync(path.join(__dirname, 'certs/wwdr.pem')),
//            signerKeyPassphrase: 'mysecretphrase'
//        });
//
//        const buffer = pass.getAsBuffer();
//        
//        // Ensure temp directory exists
//        await fs.promises.mkdir('temp', { recursive: true });
//        
//        const filePath = path.join('temp', `${uniqueId}.pkpass`);
//        await fs.promises.writeFile(filePath, buffer);
//        
//        res.json({
//            success: true,
//            passUrl: downloadUrl,
//            passId: uniqueId
//        });
//    } catch (error) {
//        console.error('Error details:', error);
//        res.status(500).json({
//            error: 'Failed to generate pass',
//            details: error.message,
//            stack: error.stack
//        });
//    }
//});
//const PORT = process.env.PORT || 3000;
//app.listen(PORT, () => {
//    console.log(`Server running on port ${PORT}`);
//});
//app.listen(PORT, '0.0.0.0', () => {
//    console.log(`Server running on port ${PORT}`);
//});
