import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from "react-native";
import { BleManager } from "react-native-ble-plx";
import { request, PERMISSIONS, RESULTS } from "react-native-permissions";

const Web = () => {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [scanning, setScanning] = useState(false);
  const bleManager = Platform.OS !== "web" ? new BleManager() : null;

  useEffect(() => {
    return () => {
      if (bleManager) {
        bleManager.destroy();
      }
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      if (!navigator.bluetooth) {
        Alert.alert("Error", "Web Bluetooth is not supported on this browser.");
        return false;
      }
      return true;
    } else if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        if (
          granted["android.permission.BLUETOOTH_SCAN"] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted["android.permission.BLUETOOTH_CONNECT"] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted["android.permission.ACCESS_FINE_LOCATION"] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert("Permission Denied", "Bluetooth permissions are required.");
          return false;
        }
        return true;
      } catch (error) {
        Alert.alert("Permission Error", error.message);
        return false;
      }
    } else if (Platform.OS === "ios") {
      const result = await request(PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL);
      if (result !== RESULTS.GRANTED) {
        Alert.alert("Permission Denied", "Bluetooth access is required.");
        return false;
      }
      return true;
    }
    return true;
  };

  const scanDevices = async () => {
    const permissionGranted = await requestPermissions();
    if (!permissionGranted) return;

    if (Platform.OS === "web") {
      try {
        const btDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
        });
        setDevices([{ id: btDevice.id, name: btDevice.name || "Unknown Device", device: btDevice }]);
      } catch (error) {
        Alert.alert("Scan Error", error.message);
      }
    } else {
      setDevices([]);
      setScanning(true);

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          Alert.alert("Scan Error", error.message);
          setScanning(false);
          return;
        }
        if (device.name && !devices.some((d) => d.id === device.id)) {
          setDevices((prev) => [
            ...prev.filter((d) => d.id !== device.id),
            {
              id: device.id,
              name: device.name,
              rssi: device.rssi,
              localName: device.localName,
            },
          ]);
        }
      });

      setTimeout(() => {
        bleManager.stopDeviceScan();
        setScanning(false);
        Alert.alert("Scan Complete", "Scanning stopped after 2 minutes.");
      }, 120000);
    }
  };

  const connectToDevice = async (item) => {
    if (Platform.OS === "web") {
      try {
        const btDevice = item.device ? item.device : item;
        // Connecting via GATT server
        const gattServer = await btDevice.gatt.connect();
        setConnectedDevice({ id: btDevice.id, name: btDevice.name, gattServer });
        Alert.alert("Connected", `Connected to ${btDevice.name}`);
      } catch (error) {
        Alert.alert("Connection Failed", error.message);
      }
    } else {
      try {
        const connected = await bleManager.connectToDevice(item.id);
        await connected.discoverAllServicesAndCharacteristics();
        setConnectedDevice(connected);
        Alert.alert("Connected", `Connected to ${item.name}`);
      } catch (error) {
        Alert.alert("Connection Failed", error.message);
      }
    }
  };

  const disconnectDevice = async () => {
    if (Platform.OS === "web") {
      if (connectedDevice && connectedDevice.gattServer) {
        connectedDevice.gattServer.disconnect();
        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device has been disconnected.");
      }
    } else {
      if (connectedDevice) {
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device has been disconnected.");
      }
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.scanButton, scanning && { backgroundColor: "gray" }]}
        onPress={scanDevices}
        disabled={scanning}
      >
        <Text style={styles.scanText}>{scanning ? "Scanning..." : "Scan Bluetooth Devices"}</Text>
      </TouchableOpacity>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.deviceContainer}>
            <View>
              <Text style={styles.deviceText}>{item.name || "Unknown Device"}</Text>
              <Text style={styles.deviceDetails}>ID: {item.id}</Text>
              {item.rssi && <Text style={styles.deviceDetails}>RSSI: {item.rssi}</Text>}
              {item.localName && <Text style={styles.deviceDetails}>Local Name: {item.localName}</Text>}
            </View>
            {connectedDevice?.id === item.id ? (
              <TouchableOpacity style={styles.connectedButton}>
                <Text style={styles.connectText}>Connected</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.connectButton} onPress={() => connectToDevice(item)}>
                <Text style={styles.connectText}>Connect</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
      {connectedDevice && (
        <View style={styles.connectedDeviceContainer}>
          <Text style={styles.connectedTitle}>Connected Device:</Text>
          <Text style={styles.deviceText}>{connectedDevice.name || "Unknown Device"}</Text>
          <Text style={styles.deviceDetails}>ID: {connectedDevice.id}</Text>
          <TouchableOpacity style={styles.disconnectButton} onPress={disconnectDevice}>
            <Text style={styles.connectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  scanButton: { backgroundColor: "#007bff", padding: 15, borderRadius: 50, marginBottom: 20 },
  scanText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  deviceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  deviceText: { fontSize: 16, fontWeight: "bold" },
  deviceDetails: { fontSize: 14, color: "#666" },
  connectButton: { backgroundColor: "#28a745", padding: 10, borderRadius: 10 },
  connectedButton: { backgroundColor: "#17a2b8", padding: 10, borderRadius: 10 },
  connectText: { color: "#fff", fontSize: 14 },
  connectedDeviceContainer: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#007bff",
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  connectedTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  disconnectButton: { backgroundColor: "#dc3545", padding: 10, borderRadius: 10, marginTop: 10 },
});

export default Web;
